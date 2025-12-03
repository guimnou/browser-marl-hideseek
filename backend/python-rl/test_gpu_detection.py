#!/usr/bin/env python3

"""

GPU Detection Test Script

Run this inside your Docker container to diagnose GPU issues

"""

 

import sys

import os

 

 

def test_gpu_detection():

    """Test GPU availability and provide diagnosis"""

 

    print("=" * 60)

    print("GPU DETECTION DIAGNOSTICS")

    print("=" * 60)

    print()

 

    # 1. Platform info

    print(f"🖥️  Platform: {sys.platform}")

    print(f"📁 Python: {sys.version.split()[0]}")

    print()

 

    # 2. Check PyTorch

    print("🔍 Checking PyTorch...")

    try:

        import torch

        print(f"   ✅ PyTorch version: {torch.__version__}")

        print(f"   CUDA available: {torch.cuda.is_available()}")

        print(f"   CUDA version: {torch.version.cuda if torch.cuda.is_available() else 'N/A'}")

        print(f"   GPU count: {torch.cuda.device_count()}")

 

        if torch.cuda.is_available():

            for i in range(torch.cuda.device_count()):

                print(f"   GPU {i}: {torch.cuda.get_device_name(i)}")

        else:

            print("   ⚠️  No CUDA GPUs detected")

    except ImportError:

        print("   ❌ PyTorch not installed")

    print()

 

    # 3. Check NVIDIA drivers

    print("🔍 Checking NVIDIA drivers...")

    try:

        import subprocess

        result = subprocess.run(['nvidia-smi'], capture_output=True, text=True)

        if result.returncode == 0:

            print("   ✅ nvidia-smi available:")

            print("   " + "\n   ".join(result.stdout.split('\n')[:10]))

        else:

            print("   ❌ nvidia-smi failed")

            print(f"   Error: {result.stderr}")

    except FileNotFoundError:

        print("   ❌ nvidia-smi not found (NVIDIA drivers not installed)")

    print()

 

    # 4. Check CUDA library

    print("🔍 Checking CUDA libraries...")

    cuda_libs = [

        '/usr/local/cuda/lib64/libcudart.so',

        '/usr/lib/x86_64-linux-gnu/libcuda.so',

        '/usr/local/cuda/lib64/libcublas.so',

    ]

    found_any = False

    for lib in cuda_libs:

        if os.path.exists(lib):

            print(f"   ✅ Found: {lib}")

            found_any = True

    if not found_any:

        print("   ⚠️  No CUDA libraries found")

    print()

 

    # 5. Check environment variables

    print("🔍 Checking environment variables...")

    cuda_vars = ['CUDA_VISIBLE_DEVICES', 'NVIDIA_VISIBLE_DEVICES', 'CUDA_HOME']

    for var in cuda_vars:

        value = os.environ.get(var, 'Not set')

        print(f"   {var}: {value}")

    print()

 

    # 6. Recommendation

    print("=" * 60)

    print("RECOMMENDATION")

    print("=" * 60)

 

    try:

        import torch

        if torch.cuda.is_available():

            print("✅ GPU is available - you can use GPU training")

            print(f"   Set num_gpus: {torch.cuda.device_count()}")

        else:

            print("⚠️  GPU NOT available - use CPU-only mode")

            print()

            print("Possible causes:")

            print("1. Docker not configured for GPU passthrough")

            print("   Fix: Use 'docker run --gpus all' or configure docker-compose.yml")

            print()

            print("2. No NVIDIA GPU on host machine")

            print("   Fix: Use CPU-only training (set num_gpus=0)")

            print()

            print("3. NVIDIA drivers not installed")

            print("   Fix: Install nvidia-docker2 on host machine")

            print()

            print("For your ppo_trainer.py, make sure to:")

            print("   • Use torch.cuda.is_available() to detect GPU")

            print("   • Set num_gpus_per_learner=0 when no GPU")

            print("   • Set num_gpus_per_env_runner=0 when no GPU")

    except ImportError:

        print("❌ PyTorch not installed - cannot check GPU")

 

    print("=" * 60)

 

 

if __name__ == "__main__":

    test_gpu_detection()