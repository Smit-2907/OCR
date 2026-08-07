#!/usr/bin/env bash

# This script helps test the hybrid OCR routing setup.
# Ensure you have Docker running and Supabase CLI installed.

echo "=========================================================="
echo "OCR POC Test Helper"
echo "=========================================================="
echo "1. Start EasyOCR Python service:"
echo "   docker-compose up --build -d"
echo ""
echo "2. Start Supabase Edge Function locally:"
echo "   Option A (Via Supabase CLI):"
echo "     supabase functions serve --env-file <(echo 'EASYOCR_API_URL=http://localhost:8000/ocr')"
echo "   Option B (Bypass CLI & run directly with Deno - RECOMMENDED if CLI hangs):"
echo "     PORT=54330 deno run --env --allow-net --allow-read --allow-env --allow-write --allow-sys supabase/functions/ocr-router/index.ts"
echo ""
echo "3. Run verification curls:"
echo "   To test EDITABLE PDF (should return manual_extraction):"
echo "   curl -X POST http://localhost:54321/functions/v1/ocr-router \\"
echo "        -H 'Content-Type: multipart/form-data' \\"
echo "        -F 'file=@/path/to/editable.pdf'"
echo ""
echo "   To test SCANNED PDF / IMAGE (should route to easyocr_api):"
echo "   curl -X POST http://localhost:54321/functions/v1/ocr-router \\"
echo "        -H 'Content-Type: multipart/form-data' \\"
echo "        -F 'file=@/path/to/scanned_or_image.pdf' \\"
echo "        -F 'langs=en'"
echo "=========================================================="

# Create mock test inputs if they do not exist
mkdir -p test_files

# Create a sample text file we can convert to PDF or upload directly
echo "This is a system generated editable PDF text file. Antigravity AI POC is successful!" > test_files/sample_text.txt

echo "Created test directory: test_files/"
