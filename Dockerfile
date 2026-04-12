FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for PostgreSQL and netcat for health checks
RUN apt-get update && apt-get install -y \
    postgresql-client \
    netcat-openbsd \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN python3 -m pip install --no-cache-dir -r requirements.txt

COPY . ./
RUN chmod +x /app/entrypoint.sh

EXPOSE 8032
ENTRYPOINT ["sh", "/app/entrypoint.sh"]
CMD ["python3", "manage.py", "runserver", "0.0.0.0:8032"]
