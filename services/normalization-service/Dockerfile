FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DOCLING_LIBREOFFICE_CMD=/usr/bin/libreoffice

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libxcb1 \
    libx11-6 \
    libxext6 \
    libxrender1 \
    libglib2.0-0 \
    libgl1 \
    libreoffice \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY *.py ./

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8091"]
