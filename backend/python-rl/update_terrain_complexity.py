#!/usr/bin/env python3
"""
Curriculum Learning Helper - Gradually Increase Terrain Complexity

This script helps you modify terrain complexity as training progresses,
allowing the agent to learn basic skills first, then more complex navigation.

Usage:
    python update_terrain_complexity.py <iteration> [--auto]

Examples:
    python update_terrain_complexity.py 50    # Set complexity for iteration 50
    python update_terrain_complexity.py 100 --auto  # Auto-set based on iteration
"""

import sys
import re
from pathlib import Path


def get_terrain_complexity_for_iteration(iteration):
    """
    Curriculum schedule: gradually increase terrain complexity

    Returns: (TERRAIN_HEIGHT_RANGE, description)
    """
    if iteration < 50:
        return 1, "Flat world - learning basic seek/hide behaviors"
    elif iteration < 100:
        return 2, "Small bumps - learning to navigate 1-block obstacles"
    elif iteration < 150:
        return 3, "Moderate terrain - learning advanced navigation"
    else:
        return 4, "Complex terrain - full challenge"


def update_config_file(terrain_height_range, iteration):
    """Update config-training-world.js with new terrain complexity"""

    config_path = Path(__file__).parent.parent.parent / \
                  "frontend/public/modes/research/src/config-training-world.js"

    if not config_path.exists():
        print(f"❌ Config file not found: {config_path}")
        return False

    # Read current config
    with open(config_path, 'r') as f:
        content = f.read()

    # Update TERRAIN_HEIGHT_RANGE
    pattern = r'(TERRAIN_HEIGHT_RANGE:\s*)\d+'
    new_content = re.sub(pattern, f'\\g<1>{terrain_height_range}', content)

    # Check if change was made
    if new_content == content:
        print(f"⚠️  Could not find TERRAIN_HEIGHT_RANGE in config")
        return False

    # Write updated config
    with open(config_path, 'w') as f:
        f.write(new_content)

    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python update_terrain_complexity.py <iteration> [--auto]")
        print("Example: python update_terrain_complexity.py 50 --auto")
        sys.exit(1)

    try:
        iteration = int(sys.argv[1])
    except ValueError:
        print(f"❌ Invalid iteration number: {sys.argv[1]}")
        sys.exit(1)

    auto_mode = '--auto' in sys.argv

    print(f"\n{'='*60}")
    print(f"🏔️  TERRAIN COMPLEXITY CURRICULUM")
    print(f"{'='*60}")
    print(f"Current training iteration: {iteration}")
    print(f"{'='*60}\n")

    if auto_mode:
        # Automatic curriculum based on iteration
        height_range, description = get_terrain_complexity_for_iteration(iteration)

        print(f"📚 Curriculum Schedule:")
        print(f"  Iteration   0-49:  TERRAIN_HEIGHT_RANGE = 1 (flat)")
        print(f"  Iteration  50-99:  TERRAIN_HEIGHT_RANGE = 2 (small bumps)")
        print(f"  Iteration 100-149: TERRAIN_HEIGHT_RANGE = 3 (moderate)")
        print(f"  Iteration 150+:    TERRAIN_HEIGHT_RANGE = 4 (complex)")
        print(f"\n📊 For iteration {iteration}:")
        print(f"  TERRAIN_HEIGHT_RANGE = {height_range}")
        print(f"  Description: {description}\n")

        response = input("Apply this change? (y/n): ").strip().lower()
        if response != 'y':
            print("❌ Cancelled")
            sys.exit(0)
    else:
        # Manual mode - user specifies
        print(f"Current iteration: {iteration}")
        print(f"\nRecommended terrain complexity:")
        height_range, description = get_terrain_complexity_for_iteration(iteration)
        print(f"  TERRAIN_HEIGHT_RANGE = {height_range}")
        print(f"  Reason: {description}\n")

        print(f"Options:")
        print(f"  1 = Flat world (no jumping needed)")
        print(f"  2 = Small bumps (1-block obstacles)")
        print(f"  3 = Moderate terrain (2-block obstacles)")
        print(f"  4 = Complex terrain (full challenge)")

        choice = input(f"\nEnter terrain height range (1-4, or Enter for recommended): ").strip()

        if choice == '':
            # Use recommended
            pass
        else:
            try:
                height_range = int(choice)
                if height_range < 1 or height_range > 4:
                    print(f"❌ Invalid choice. Must be 1-4")
                    sys.exit(1)
            except ValueError:
                print(f"❌ Invalid input")
                sys.exit(1)

    # Apply change
    print(f"\n🔧 Updating config...")
    if update_config_file(height_range, iteration):
        print(f"✅ Successfully updated TERRAIN_HEIGHT_RANGE to {height_range}")
        print(f"\n⚠️  IMPORTANT:")
        print(f"  1. Restart training from this checkpoint")
        print(f"  2. New terrain will be generated each episode")
        print(f"  3. Agent will adapt to new terrain complexity")
        print(f"  4. May take 10-20 iterations to fully adapt")
        print(f"\n{'='*60}\n")
    else:
        print(f"❌ Failed to update config")
        sys.exit(1)


if __name__ == "__main__":
    main()
