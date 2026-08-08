#!/usr/bin/env bash

# This script helps test the hybrid OCR routing setup.
# Ensure you have Docker running and Supabase CLI installed.

echo "=========================================================="
echo "OCR POC Test Helper"
echo "=========================================================="
echo "1. Start Supabase Edge Function locally (direct with Deno):"
echo "     PORT=54330 deno run --env --allow-net --allow-read --allow-env --allow-write --allow-sys supabase/functions/ocr-router/index.ts"
echo ""
echo "2. Run verification curls:"
echo "   To test EDITABLE PDF (should return manual_extraction directly):"
echo "   curl -X POST http://localhost:54330?langs=en \\"
echo "        -H 'Content-Type: multipart/form-data' \\"
echo "        -F 'file=@test_files/sample_text.txt'"
echo ""
echo "   To test SCANNED PDF / IMAGE (should route to online EasyOCR API):"
echo "   curl -X POST http://localhost:54330?langs=en \\"
echo "        -H 'Content-Type: multipart/form-data' \\"
echo "        -H 'x-access-key: YOUR_EASYOCR_KEY' \\"
echo "        -F 'file=@/path/to/scanned_or_image.jpg'"
echo "=========================================================="

# Create mock test inputs if they do not exist
mkdir -p test_files

# Create a sample text file we can convert to PDF or upload directly
echo "This is a system generated editable PDF text file. Antigravity AI POC is successful!" > test_files/sample_text.txt

echo "Created test directory: test_files/"
