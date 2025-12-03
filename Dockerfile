FROM python:3.11-slim

RUN apt update && apt install -y git build-essential curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

RUN pip3 install --no-cache-dir \
    ray[rllib]==2.50.0 \
    gymnasium==1.1.1 \
    torch==2.1.0 \
    numpy==1.26.4 \
    websockets==12.0 \
    pandas==2.1.0 \
    tensorboard==2.15.1 \
    nest-asyncio==1.5.8 \
    pyyaml==6.0.1 \
    matplotlib==3.8.2

RUN npm install -g http-server

EXPOSE 8080 6006

CMD ["/bin/bash"]
