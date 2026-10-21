FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs as user 1000
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    PORT=7860

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy source code and encodings
COPY --chown=user:user . /app
RUN chown -R user:user /home/user /app

USER user

# Pre-download Facenet512 model weights during build
RUN python -c "from deepface import DeepFace; import numpy as np; DeepFace.represent(np.zeros((160, 160, 3), dtype=np.uint8), model_name='Facenet512', detector_backend='skip', enforce_detection=False)" || true

EXPOSE 7860

CMD ["python", "app.py"]

