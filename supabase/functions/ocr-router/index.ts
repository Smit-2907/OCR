import pdf from "npm:pdf-parse@1.1.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const port = parseInt(Deno.env.get("PORT") || "54321");

Deno.serve({ port }, async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed. Use POST." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    let file: File | null = null;
    let fileName = "file";
    let fileType = "";

    // 1. Parse incoming file (either from Multipart Form or direct raw body)
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const formFile = formData.get("file");
      if (!formFile || !(formFile instanceof File)) {
        return new Response(
          JSON.stringify({ error: "No file found in multipart/form-data 'file' field" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      file = formFile;
      fileName = file.name;
      fileType = file.type;
    } else {
      // Treat the request body as the raw file content (e.g. application/pdf or image/png)
      const buffer = await req.arrayBuffer();
      if (!buffer || buffer.byteLength === 0) {
        return new Response(
          JSON.stringify({ error: "Empty request body" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      // Infer content type
      fileType = contentType.split(";")[0].trim();
      fileName = fileType === "application/pdf" ? "document.pdf" : "image.bin";
      file = new File([buffer], fileName, { type: fileType });
    }

    const isPdf = fileName.endsWith(".pdf") || fileType === "application/pdf";
    console.log(`Processing file: ${fileName}, type: ${fileType}, size: ${file.size} bytes`);

    // Extract search query params for languages
    const reqUrl = new URL(req.url);
    const langs = reqUrl.searchParams.get("langs") || "en";

    // 2. Process file based on type
    if (isPdf) {
      const arrayBuffer = await file.arrayBuffer();
      const pdfBuffer = new Uint8Array(arrayBuffer);

      let extractedText = "";
      let pdfParseSuccess = false;

      try {
        console.log("Attempting manual text layer extraction from PDF...");
        const parsedPdf = await pdf(pdfBuffer);
        extractedText = parsedPdf.text || "";
        pdfParseSuccess = true;
      } catch (err) {
        console.warn("Manual PDF text extraction failed or unsupported. Details:", err);
        // Will fall back to EasyOCR API since pdfParseSuccess remains false
      }

      // Clean up extracted text and count alphanumeric characters
      const cleanedText = extractedText.trim();
      const alphanumericCount = cleanedText.replace(/[^a-zA-Z0-9]/g, "").length;

      // If we have a healthy amount of text, treat it as an editable PDF
      if (pdfParseSuccess && alphanumericCount > 20) {
        console.log("PDF is editable. Successfully extracted text directly.");
        return new Response(
          JSON.stringify({
            source: "manual_extraction",
            filename: fileName,
            is_editable: true,
            full_text: cleanedText,
            character_count: cleanedText.length,
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      console.log("PDF text layer is empty or scanned. Falling back to online EasyOCR API...");
    } else {
      console.log("File is an image. Forwarding to online EasyOCR API...");
    }

    // 3. Forward to the online EasyOCR Console API
    const targetUrl = new URL("https://console.easyocr.org/api/ocr");
    targetUrl.searchParams.set("langs", langs);

    // Enforce 5MB limit on online EasyOCR API calls
    if (file.size > 5 * 1024 * 1024) {
      throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(2)}MB) exceeds the 5MB maximum limit supported by the online EasyOCR API.`);
    }

    console.log(`Calling Online EasyOCR API: ${targetUrl.toString()}`);

    const forwardData = new FormData();
    forwardData.append("file", file);
    
    const headers = new Headers();

    let clientAccessKey = req.headers.get("x-access-key") 
      || Deno.env.get("EASYOCR_ACCESS_KEY") 
      || Deno.env.get("OCR_SPACE_KEY") 
      || Deno.env.get("OCR_API_KEY") 
      || "";

    // Clean any surrounding quotes and whitespace
    clientAccessKey = clientAccessKey.replace(/['"]/g, "").trim();

    // Check if the key is a placeholder or empty
    const isPlaceholder = clientAccessKey.toLowerCase().includes("your")
      || clientAccessKey.toLowerCase().includes("key")
      || clientAccessKey.toLowerCase().includes("placeholder")
      || clientAccessKey.toLowerCase().includes("here")
      || clientAccessKey.length < 5;

    if (isPlaceholder || !clientAccessKey) {
      throw new Error("Missing or invalid EasyOCR Access Key. Please check your .env file or input a valid key in the Web UI settings.");
    }

    headers.set("X-Access-Key", clientAccessKey);

    // Use AbortController to implement the recommended 30-second request timeout limit
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let apiResponse: Response;
    try {
      apiResponse = await fetch(targetUrl.toString(), {
        method: "POST",
        headers,
        body: forwardData,
        signal: controller.signal,
      });
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Downstream OCR request timed out. The EasyOCR service took longer than the recommended 30 seconds to respond.");
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    if (!apiResponse.ok) {
      // Catch specific rate-limiting status code
      if (apiResponse.status === 429) {
        throw new Error("Too Many Requests. EasyOCR API usage quota has been exceeded (max 60 requests/minute, 1000/hour). Please try again later.");
      }

      const errText = await apiResponse.text();
      let errorMsg = errText;
      try {
        const parsedErr = JSON.parse(errText);
        errorMsg = parsedErr.message || parsedErr.error || parsedErr.detail || errText;
      } catch (_) {}
      throw new Error(`Online EasyOCR API returned status ${apiResponse.status}: ${errorMsg}`);
    }

    const ocrResult = await apiResponse.json();
    console.log("EasyOCR Console API raw response:", JSON.stringify(ocrResult));

    // Online Console API returns words array
    const fullText = (ocrResult.words || []).map((w: any) => w.text).join(" ");
    const pages = [{ page: 1, text: fullText }];

    return new Response(
      JSON.stringify({
        source: "easyocr_api",
        filename: fileName,
        is_editable: false,
        full_text: fullText,
        pages: pages,
        languages: [langs],
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("Error during OCR routing:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
