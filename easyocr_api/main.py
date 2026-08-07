import io
import os
import tempfile
import numpy as np
from PIL import Image
from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import easyocr
from pdf2image import convert_from_path

app = FastAPI(
    title="EasyOCR API Service",
    description="A simple API service to perform OCR on images and scanned PDFs using EasyOCR.",
    version="1.0.0"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Cache readers by language combination to avoid reloading models on every request.
# Key is a comma-separated sorted string of languages, e.g., "en" or "de,en"
readers = {}

def get_ocr_reader(langs_list: list[str]) -> easyocr.Reader:
    key = ",".join(sorted(langs_list))
    if key not in readers:
        print(f"Initializing EasyOCR reader for languages: {langs_list}...")
        # gpu=False by default to work out-of-the-box on standard CPU environments.
        # Can be configured via environment variable if GPU is available.
        use_gpu = os.environ.get("USE_GPU", "false").lower() == "true"
        readers[key] = easyocr.Reader(langs_list, gpu=use_gpu)
    return readers[key]

@app.get("/")
def read_root():
    return {"status": "ok", "service": "EasyOCR API Service"}

@app.post("/ocr")
async def perform_ocr(
    file: UploadFile = File(...),
    langs: str = Query("en", description="Comma-separated list of language codes, e.g., 'en,es'")
):
    # Parse requested languages
    langs_list = [lang.strip() for lang in langs.split(",") if lang.strip()]
    if not langs_list:
        langs_list = ["en"]

    try:
        reader = get_ocr_reader(langs_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize OCR reader: {str(e)}")

    filename = file.filename or "file"
    content_type = file.content_type or ""

    # Check if the file is a PDF
    is_pdf = filename.endswith(".pdf") or content_type == "application/pdf"

    extracted_text = []

    try:
        if is_pdf:
            # For PDF, save it to a temporary file, then convert pages to images
            suffix = ".pdf"
            with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
                content = await file.read()
                temp_file.write(content)
                temp_file_path = temp_file.name

            try:
                # Convert PDF pages to PIL Images (requires poppler-utils installed)
                images = convert_from_path(temp_file_path)
                
                for page_num, image in enumerate(images, start=1):
                    # Convert PIL Image to numpy array for EasyOCR
                    img_array = np.array(image)
                    # Perform OCR
                    results = reader.readtext(img_array, detail=0)
                    page_text = " ".join(results)
                    extracted_text.append({
                        "page": page_num,
                        "text": page_text
                    })
            finally:
                # Clean up the temp file
                if os.path.exists(temp_file_path):
                    os.remove(temp_file_path)
        else:
            # For Image files (PNG, JPEG, etc.)
            content = await file.read()
            image = Image.open(io.BytesIO(content)).convert("RGB")
            img_array = np.array(image)
            results = reader.readtext(img_array, detail=0)
            text = " ".join(results)
            extracted_text.append({
                "page": 1,
                "text": text
            })

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

    # Combine all pages' text for convenience
    full_text = "\n\n".join([page["text"] for page in extracted_text])

    return {
        "filename": filename,
        "is_pdf": is_pdf,
        "languages": langs_list,
        "full_text": full_text,
        "pages": extracted_text
    }
