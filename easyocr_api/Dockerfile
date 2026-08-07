FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install system dependencies:
# - poppler-utils: required by pdf2image
# - libgl1 and libglib2.0-0: required by OpenCV (used by EasyOCR)
RUN apt-get update && apt-get install -y --no-install-recommends \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the default English model so it's baked into the image.
# This prevents downloading it dynamically on the first request, improving startup speed.
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# Copy application files
COPY . .

EXPOSE 8000

# Run the FastAPI app with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
