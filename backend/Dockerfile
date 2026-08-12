FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app ./app
# Ensure static files are included specifically if needed, 
# although COPY app ./app should usually cover it if static is inside app.
# Adding explicit verification/instruction for clarity.

# Expose port
EXPOSE 8000

# Health check
# /health yolu yok (router /health/live veriyor) ve raise_for_status olmadan
# 404 bile basarili sayiliyordu; ikisi de duzeltildi.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import httpx; httpx.get('http://localhost:8000/health/live').raise_for_status()"

# Run uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
