FROM python:3.11-slim

ARG DOCKER_GID=999


ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists
# Copy the rest of the application source code
COPY . .

# Expose the port your app runs on (change 8000 if needed)
EXPOSE 8000

# Create and switch to a non-privileged user for security
RUN useradd --create-home appuser && chown -R appuser /app

# add the user to the docker group to allow access to the Docker socket
RUN groupadd -g $DOCKER_GID docker && usermod -aG docker appuser

USER appuser

# Define the command to execute your application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]