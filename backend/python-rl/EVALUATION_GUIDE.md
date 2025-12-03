# Agent Evaluation Guide

## Selective Demo Mode for Agent Evaluation

Use `demo_model_selective.py` to test trained agents in isolation and compare their performance against random baselines.

### Why This Matters

Multi-agent RL can be tricky - sometimes agents appear to learn, but they're just exploiting each other's weaknesses. Testing agents against random opponents helps verify they've learned genuine strategies.

### Quick Start

```bash
# From backend/python-rl directory
python demo_model_selective.py
```

### Evaluation Modes

#### 1. Seeker TRAINED, Hiders RANDOM ⭐
**Purpose**: Test if seeker learned to seek effectively

**What to look for:**
- Does seeker move purposefully toward hiders?
- Does seeker catch hiders faster than random?
- Does seeker use vision to track hiders?

**Good performance**: Seeker catches 1-2 hiders within episode
**Poor performance**: Seeker wanders randomly, no catches

#### 2. Hiders TRAINED, Seeker RANDOM
**Purpose**: Test if hiders learned to hide effectively

**What to look for:**
- Do hiders move away from seeker?
- Do hiders use obstacles/terrain to hide?
- Do hiders survive longer than random?

**Good performance**: Hiders survive most/all of episode
**Poor performance**: Hiders get caught quickly like random agents

#### 3. Both TRAINED (Default)
**Purpose**: Full trained interaction, emergent behavior

**What to look for:**
- Complex hide-and-seek behavior
- Seeker actively seeking, hiders actively hiding
- Strategic use of environment

#### 4. Both RANDOM (Baseline)
**Purpose**: Establish performance baseline

**What to look for:**
- Random wandering
- Accidental catches (if any)
- This is your "zero learning" baseline

### Evaluation Workflow

```
1. Train model for N iterations
2. Run evaluation in each mode
3. Compare performance:

Mode                    | Expected Seeker Reward | Expected Hider Reward
------------------------|------------------------|----------------------
Seeker trained vs random| HIGH (>25)            | LOW (<15)
Hiders trained vs random| LOW (<10)             | HIGH (>25)
Both trained            | MEDIUM                | MEDIUM
Both random (baseline)  | ~0-10                 | ~0-10
```

### Example Evaluation Session

```bash
# Test iteration 20 checkpoint

$ python demo_model_selective.py

# Select mode 1: Seeker trained, hiders random
# Select checkpoint 20
# Watch 3-5 episodes
# Record: Did seeker catch hiders? How quickly?

# Restart and select mode 2: Hiders trained, seeker random
# Select checkpoint 20
# Watch 3-5 episodes
# Record: Did hiders survive? How long?

# Compare to mode 4: Both random
# Watch 3-5 episodes
# Record baseline performance
```

### Interpreting Results

#### Seeker Learning Well
- Mode 1: Catches 1-2 hiders per episode
- Mode 1: Moves directly toward visible hiders
- Mode 1: Reward > 20
- Mode 3: Competes with trained hiders

#### Hiders Learning Well
- Mode 2: Survives most of episode
- Mode 2: Actively avoids seeker
- Mode 2: Reward > 20
- Mode 3: Successfully evades trained seeker

#### Poor Learning
- Mode 1/2: Similar to Mode 4 (random baseline)
- No purposeful movement
- Rewards close to baseline (~10-15)

### Advanced: Recording Metrics

Create a simple spreadsheet to track performance:

```
Checkpoint | Mode             | Avg Seeker Reward | Avg Hider Reward | Notes
-----------|------------------|-------------------|------------------|------------------
20         | Seeker trained   | 15.2              | 18.3            | Some seeking
20         | Hider trained    | 12.1              | 22.4            | Good hiding
20         | Both trained     | 16.5              | 19.2            | Mixed
20         | Both random      | 8.3               | 11.7            | Baseline
-----------|------------------|-------------------|------------------|------------------
50         | Seeker trained   | 28.4              | 12.1            | Strong seeking!
50         | Hider trained    | 8.2               | 26.7            | Strong hiding!
...
```

### Tips

1. **Run 3-5 episodes per mode** for statistical reliability
2. **Focus on behavior, not just rewards** - does it *look* intelligent?
3. **Compare to baseline (mode 4)** - improvement over random is key
4. **Test at different training checkpoints** to track progress
5. **Watch for overfitting** - trained seeker should still work vs random hiders

### Common Issues

**Both modes perform similarly:**
- Agents haven't learned yet
- Need more training iterations
- Reward signals may be too sparse

**Trained agent performs worse than random:**
- Serious training issue
- Check for reward bugs
- Verify network is updating

**Only one agent learning:**
- Normal in early training!
- One agent learns first, then the other adapts
- Continue training for balance

---

## Original Demo Mode

The original `demo_model.py` still works for viewing both trained agents:

```bash
python demo_model.py  # Both agents use trained models
```

Use this when you want to see the full trained interaction without isolation.
