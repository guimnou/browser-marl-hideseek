# Docker GPU Setup Guide

## Problem

Your Docker container cannot access the GPU on your host machine. You're seeing errors like:
```
UserWarning: Can't initialize NVML
RuntimeError: Found 0 GPUs on your machine
```

**Key Evidence:**
- `nvidia-smi` not available inside container
- `torch.cuda.is_available()` returns False
- Warning: "Can't initialize NVML"

## Root Cause

Docker containers are **isolated** from the host system by default. Even if your host has a GPU, Docker containers need special configuration to access it.

## Solution 1: Use NVIDIA Container Toolkit (Recommended)

### Prerequisites
On your **host machine** (not inside Docker), install NVIDIA Container Toolkit:

```bash
# Ubuntu/Debian
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo systemctl restart docker
```

### Run Docker with GPU Access

When starting your container, use the `--gpus` flag:

```bash
# Single GPU
docker run --gpus all -it your-image

# Or specify GPU devices
docker run --gpus '"device=0"' -it your-image
```

### If Using Docker Compose

Update your `docker-compose.yml`:

```yaml
version: '3.8'

services:
  minecraft-rl:
    image: your-image
    runtime: nvidia  # For older Docker versions
    # OR for newer versions:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
```

## Solution 2: Use CPU Training (Current Fallback)

The code **now automatically detects** when GPU is unavailable and falls back to CPU training:

```
🐧 Linux detected - using 9GB object store (Docker /dev/shm limit)
⚠️  No GPU detected - using CPU training (slower but works)
```

**Performance Impact:**
- CPU training is ~10-50× slower than GPU
- But it works correctly!
- Good for testing, not ideal for long training runs

## Verify GPU Access

Once you've configured Docker with GPU access, verify inside the container:

```bash
# Check nvidia-smi
nvidia-smi

# Check PyTorch CUDA
python3 -c "import torch; print('CUDA available:', torch.cuda.is_available())"
python3 -c "import torch; print('GPU name:', torch.cuda.get_device_name(0))"
```

You should see:
```
CUDA available: True
GPU name: NVIDIA GeForce RTX 3080 (or your GPU model)
```

## Current Status

✅ Code is **GPU-aware**: Automatically detects and uses GPU when available
✅ Code is **GPU-tolerant**: Falls back to CPU when GPU unavailable
⚠️ Docker container: **No GPU access configured** (using CPU fallback)

## Next Steps

**Option A - Enable GPU (Faster Training):**
1. Exit Docker container
2. Install NVIDIA Container Toolkit on host
3. Restart container with `--gpus all` flag
4. Verify GPU access with `nvidia-smi`
5. Run training - should see GPU messages

**Option B - Continue with CPU (Simpler):**
1. Accept slower training speed
2. Everything works, just slower
3. No Docker configuration needed

## Training Performance Comparison

| Hardware | Iterations/Hour | 100 Iterations | 1000 Iterations |
|----------|----------------|----------------|-----------------|
| GPU (RTX 3080) | ~20 | ~5 hours | ~50 hours |
| CPU (8 cores) | ~2-5 | ~20-50 hours | ~200-500 hours |

For your 50,000 episode training (≈200 iterations), GPU is **highly recommended**.

---

**Your Choice:**
If you have a GPU on your host and want faster training, follow **Solution 1**.
If you're okay with slower CPU training, everything works as-is with **Solution 2**.
