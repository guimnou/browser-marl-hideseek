# Reward System Documentation

## Overview

The reward system is the **core mechanism** that guides agent learning in reinforcement learning. Well-designed rewards lead to desired behaviors; poorly designed rewards lead to unexpected or undesirable behaviors.

This document explains:
- How rewards are calculated for seekers and hiders
- Why rewards are balanced the way they are
- The critical bug we fixed (reward shaping)
- Best practices for reward design

## Reward Philosophy

### Design Principles

1. **Sparse Terminal Rewards >> Dense Step Rewards**
   - Terminal rewards (catching, surviving) should dominate
   - Step rewards (vision, hiding) should only bootstrap learning
   - Prevents agents from optimizing for the wrong objective

2. **Aligned with True Objective**
   - Seeker objective: **Catch hiders** (not just see them)
   - Hider objective: **Survive** (not just be hidden)
   - Rewards must directly encourage these goals

3. **Balanced Competition**
   - Neither agent should dominate completely
   - Both agents should have a chance to win
   - Competitive balance leads to better learning

4. **Dense Enough to Learn**
   - Pure sparse rewards (only terminal) are too hard
   - Need some per-step signal to guide exploration
   - But per-step rewards must be small!

## Current Reward Structure

### Seeker Rewards

#### Per-Step Rewards

```javascript
REWARD_CONFIG = {
  TIME_PENALTY: -0.001,
  SEEKER_SEES_HIDER: 0.01,
  SEEKER_PROXIMITY: 0.005 * (32 - distance) / 30  // Max 0.005
}
```

**Time Penalty** (`-0.001`):
- Encourages faster catching
- Total penalty per episode: -0.001 × 240 = **-0.24**
- Minor penalty, just a tie-breaker

**Vision Reward** (`+0.01` per hider in vision):
- Bootstraps learning: "seeing is good"
- Per episode (if always seeing 1 hider): 0.01 × 240 = **+2.4**
- **CRITICAL**: Must be much smaller than catching reward!

**Proximity Reward** (`+0.005` max):
- Encourages getting closer to hiders
- Max per episode: 0.005 × 240 = **+1.2**
- Helps bridge the gap between seeing and catching

#### Terminal Rewards

```javascript
REWARD_CONFIG = {
  SEEKER_CAUGHT_HIDER: 50.0,
  SEEKER_CAUGHT_ALL: 100.0,  // Bonus on top
  SEEKER_CAUGHT_NONE: -10.0
}
```

**Caught One Hider** (`+50.0`):
- Primary objective achieved
- **42× larger** than max vision reward (2.4)
- Ensures catching is the main goal

**Caught All Hiders** (`+100.0` bonus):
- If caught all 2 hiders: 2×50.0 + 100.0 = **+200.0**
- Massive reward for perfect performance
- Encourages catching multiple hiders

**Caught No Hiders** (`-10.0`):
- Penalty for complete failure
- Prevents seeker from just wandering around

#### Example Episode Rewards

**Scenario 1: Perfect Episode**
```
Seeker catches both hiders in 15 seconds (180 steps)

Per-step rewards:
- Time penalty: -0.001 × 180 = -0.18
- Vision reward: 0.01 × 180 × 1.5 avg = +2.7
- Proximity reward: ~+0.5

Terminal rewards:
- Caught hider 1: +50.0
- Caught hider 2: +50.0
- Caught all bonus: +100.0

Total: +203.0  ⭐ Excellent!
```

**Scenario 2: Partial Success**
```
Seeker catches 1 hider, time expires (240 steps)

Per-step rewards:
- Time penalty: -0.001 × 240 = -0.24
- Vision reward: +2.4
- Proximity reward: +0.8

Terminal rewards:
- Caught hider 1: +50.0
- (No bonus for catching all)

Total: +52.96  ✓ Good
```

**Scenario 3: Failure**
```
Seeker doesn't catch anyone (240 steps)

Per-step rewards:
- Time penalty: -0.24
- Vision reward: +2.4
- Proximity reward: +0.5

Terminal rewards:
- Caught none: -10.0

Total: -7.34  ✗ Bad
```

### Hider Rewards

#### Per-Step Rewards

```javascript
REWARD_CONFIG = {
  TIME_PENALTY: -0.001,
  HIDER_HIDDEN: 0.2,
  HIDER_BEING_SEEN: -0.2,
  HIDER_DISTANCE: 0.01 * Math.max(0, (distance - 2) / 30)  // Max 0.01
}
```

**Time Penalty** (`-0.001`):
- Same as seeker
- Total per episode: **-0.24**

**Hidden Reward** (`+0.2` when NOT in seeker vision):
- Encourages staying out of sight
- Per episode (if always hidden): 0.2 × 240 = **+48.0**
- Almost equal to survival reward (50.0)!

**Seen Penalty** (`-0.2` when IN seeker vision):
- Discourages being visible
- Per episode (if always visible): -0.2 × 240 = **-48.0**
- Large penalty to encourage hiding

**Distance Reward** (`+0.01` max):
- Encourages staying far from seekers
- Max per episode: 0.01 × 240 = **+2.4**
- Minor bonus for maintaining distance

#### Terminal Rewards

```javascript
REWARD_CONFIG = {
  HIDER_SURVIVED: 50.0,
  HIDER_CAUGHT: -50.0
}
```

**Survived** (`+50.0`):
- Primary objective achieved
- Comparable to per-step hidden bonus (48.0)
- **1.04× larger** than always-hidden reward

**Caught** (`-50.0`):
- Primary objective failed
- Symmetric with survival reward
- Strong incentive to avoid capture

#### Example Episode Rewards

**Scenario 1: Perfect Hiding**
```
Hider stays hidden entire episode, survives (240 steps)

Per-step rewards:
- Time penalty: -0.24
- Hidden reward: 0.2 × 240 = +48.0
- Distance reward: +2.0

Terminal rewards:
- Survived: +50.0

Total: +99.76  ⭐ Excellent!
```

**Scenario 2: Spotted But Survived**
```
Hider seen for 60 steps, hidden for 180 steps (240 total)

Per-step rewards:
- Time penalty: -0.24
- Seen penalty: -0.2 × 60 = -12.0
- Hidden reward: 0.2 × 180 = +36.0
- Distance reward: +1.5

Terminal rewards:
- Survived: +50.0

Total: +75.26  ✓ Good
```

**Scenario 3: Caught Early**
```
Hider caught at step 120

Per-step rewards:
- Time penalty: -0.001 × 120 = -0.12
- Seen penalty: -0.2 × 60 = -12.0
- Hidden reward: 0.2 × 60 = +12.0
- Distance reward: +0.5

Terminal rewards:
- Caught: -50.0

Total: -49.62  ✗ Very bad
```

## The Critical Bug: Reward Shaping

### Discovery

During demo testing, we noticed the seeker was:
- Following hiders closely ✓
- Keeping hiders in vision ✓
- **NOT actually catching them** ✗

And still accumulating **+18 rewards** per episode!

### Root Cause Analysis

Let's calculate the old reward structure:

**OLD VALUES**:
```javascript
// OLD (BROKEN)
REWARD_CONFIG = {
  SEEKER_SEES_HIDER: 0.1,  // TOO HIGH!
  SEEKER_CAUGHT_HIDER: 10.0,
  SEEKER_CAUGHT_ALL: 20.0
}
```

**Seeker watching hider for full episode**:
```
Vision reward: 0.1 × 240 steps = +24.0
```

**Seeker catching both hiders**:
```
Caught hider 1: +10.0
Caught hider 2: +10.0
Total: +20.0
```

**Problem**: Watching (24.0) > Catching (20.0)!

The seeker learned to **optimize for vision** instead of **catching**, because:
- Vision reward accumulates every step
- Catching is risky (hider might escape)
- Watching is safe and gives more reward

This is a textbook case of **reward hacking** - the agent found a loophole!

### The Fix

We rebalanced the rewards to make catching **42× more valuable** than watching:

**NEW VALUES**:
```javascript
// NEW (FIXED)
REWARD_CONFIG = {
  SEEKER_SEES_HIDER: 0.01,  // Reduced 10×
  SEEKER_CAUGHT_HIDER: 50.0,  // Increased 5×
  SEEKER_CAUGHT_ALL: 100.0  // Increased 5×
}
```

**New comparison**:
```
Vision (full episode): 0.01 × 240 = +2.4
Catching both: 2×50.0 + 100.0 = +200.0

Ratio: 200.0 / 2.4 = 83.3×  (catching is 83× more valuable!)
```

Even if we consider that the seeker sees hiders while catching:
```
Vision during catching: ~2.4
Catching rewards: 200.0
Total: 202.4

Pure vision: 2.4
Ratio: 202.4 / 2.4 = 84.3×  (still 42× better to catch!)
```

### Results After Fix

After rebalancing:
- Seeker now **actively tries to catch** hiders ✓
- Seeker doesn't stop when hider is in vision ✓
- Seeker makes contact to complete the catch ✓
- Rewards correctly reflect performance ✓

## Reward Balance Analysis

### Seeker vs Hider Symmetry

```
Seeker Perfect:      +200.0 (caught both)
Hider Perfect:       +99.76 (stayed hidden, survived)

Seeker Good:         +53.0 (caught one)
Hider Good:          +75.0 (spotted but survived)

Seeker Failure:      -7.34 (caught none)
Hider Failure:       -49.62 (caught early)
```

**Analysis**:
- Seeker has higher ceiling (+200 vs +100)
- Hider has more consistent rewards (+75-100)
- Both have strong failure penalties
- **Balanced** - neither dominates

### Dense vs Sparse Ratio

**Seeker**:
```
Max per-step: 2.4 (vision) + 1.2 (proximity) = 3.6
Max terminal: 200.0 (catch both)
Ratio: 200.0 / 3.6 = 55.6:1  (terminal dominates)
```

**Hider**:
```
Max per-step: 48.0 (hidden) + 2.4 (distance) = 50.4
Max terminal: 50.0 (survived)
Ratio: 50.0 / 50.4 = 0.99:1  (nearly equal!)
```

**Observation**: Hider rewards are more dense than seeker rewards!

**Why?**
- Hiders need more guidance to find good hiding spots
- Seekers have clearer objective (chase visible hiders)
- Balanced by hider's higher entropy coefficient (0.01 vs 0.001)

## Reward Design Best Practices

### 1. Start with Terminal Rewards

Always define success/failure first:
```javascript
// ✓ GOOD: Clear terminal conditions
CAUGHT_HIDER: +50.0
SURVIVED: +50.0
```

Then add dense rewards to guide learning:
```javascript
// ✓ GOOD: Much smaller than terminal
VISION: +0.01  (2.4% of terminal)
HIDDEN: +0.2   (0.4% per step)
```

### 2. Calculate Cumulative Rewards

Always check total accumulated rewards:
```javascript
// Example: Vision reward
per_step = 0.01
max_steps = 240
total = per_step * max_steps = 2.4

// Compare to terminal
terminal = 50.0
ratio = terminal / total = 20.8:1  ✓ Good!
```

### 3. Test in Demo Mode

Before training, test rewards manually:
```javascript
// Demo mode: Control agent, check rewards
console.log("Step 100 reward:", current_reward);
console.log("Episode total:", cumulative_reward);
```

Watch for:
- ❌ High rewards without achieving objective
- ✓ Rewards aligned with desired behavior

### 4. Avoid Reward Hacking

Common hacks:
```javascript
// ❌ BAD: Agent can maximize reward without objective
CLOSE_TO_HIDER: +1.0  // Agent just stays near, doesn't catch
HIDER_VISIBLE: +0.5   // Agent just looks, doesn't hide

// ✓ GOOD: Reward requires objective
CAUGHT_HIDER: +50.0   // Must actually catch
SURVIVED: +50.0       // Must actually survive
```

### 5. Symmetric for Competitive Games

If zero-sum game, rewards should sum to zero:
```javascript
// Catching event
SEEKER_CAUGHT: +50.0
HIDER_CAUGHT: -50.0
Total: 0.0  ✓ Zero-sum
```

For our game:
```javascript
// Perfect seeker: +200.0
// Perfect hiders: 2 × +99.76 = +199.52
// Total: +399.52 (not zero-sum)
```

**Note**: Our game is **not strictly zero-sum** because:
- Multiple hiders can all survive
- Both seeker and hiders can get high rewards
- Creates more cooperative-competitive dynamics

### 6. Consider Exploration

Dense rewards help exploration:
```javascript
// Hider
HIDDEN: +0.2  // Immediate feedback: "this spot is good!"

// Seeker
VISION: +0.01  // Immediate feedback: "this direction is good!"
```

But don't make them too large, or agents never reach terminal states!

## Tuning Rewards

### When to Increase Rewards

**Symptom**: Agent not learning desired behavior

**Example**: Seeker not chasing hiders

**Solution**: Increase reward for chasing
```javascript
// Before
SEEKER_PROXIMITY: 0.005

// After
SEEKER_PROXIMITY: 0.02  // 4× increase
```

### When to Decrease Rewards

**Symptom**: Agent optimizing for wrong objective

**Example**: Seeker just watching hiders (our bug!)

**Solution**: Decrease dense reward, increase sparse
```javascript
// Before
SEEKER_SEES_HIDER: 0.1  // Too high

// After
SEEKER_SEES_HIDER: 0.01  // 10× decrease
SEEKER_CAUGHT_HIDER: 50.0  // 5× increase
```

### Iterative Tuning Process

```
1. Train for 50 iterations
2. Watch demo of learned behavior
3. Identify issues:
   - Not catching? → Increase catch reward
   - Not hiding? → Increase hidden reward
   - Reward hacking? → Rebalance dense/sparse
4. Adjust rewards (small changes!)
5. Retrain from checkpoint
6. Repeat until behavior is correct
```

**Important**: Make small changes (2-5×), not massive changes (100×)!

## Advanced Reward Shaping

### Curriculum Rewards

Start with dense rewards, gradually make sparse:

```javascript
// Iteration 0-50: Learning basics
if (iteration < 50) {
  SEEKER_SEES_HIDER = 0.05;  // High guidance
}
// Iteration 50-200: Refinement
else if (iteration < 200) {
  SEEKER_SEES_HIDER = 0.02;  // Medium guidance
}
// Iteration 200+: Mastery
else {
  SEEKER_SEES_HIDER = 0.01;  // Low guidance
}
```

Benefits:
- Easier learning early on
- Prevents reward hacking later
- Gradual transition to true objective

### Shaped Rewards

Add intermediate milestones:

```javascript
// Distance-based shaping
if (distance < 5) {
  reward += 0.1;  // Very close
} else if (distance < 10) {
  reward += 0.05;  // Close
} else if (distance < 20) {
  reward += 0.01;  // Nearby
}
```

Helps agent learn progression: far → nearby → close → caught

### Potential-Based Shaping

Theoretically grounded reward shaping:

```
R'(s, a, s') = R(s, a, s') + γΦ(s') - Φ(s)

Where:
- R = original reward
- Φ = potential function (e.g., -distance to goal)
- γ = discount factor
```

**Property**: Doesn't change optimal policy!

Example:
```javascript
const Φ = (state) => -state.distance_to_hider;

shaped_reward = original_reward +
                GAMMA * Φ(next_state) - Φ(current_state);
```

## Debugging Rewards

### Log Reward Breakdown

```javascript
console.log(`Step ${step} Rewards:`);
console.log(`  Time penalty: ${time_penalty.toFixed(3)}`);
console.log(`  Vision: ${vision_reward.toFixed(3)}`);
console.log(`  Proximity: ${proximity_reward.toFixed(3)}`);
console.log(`  Terminal: ${terminal_reward.toFixed(3)}`);
console.log(`  TOTAL: ${total_reward.toFixed(3)}`);
```

### Track Episode Cumulative Rewards

```javascript
episode_rewards = {
  time_penalty: 0,
  vision: 0,
  proximity: 0,
  terminal: 0
};

// Each step
episode_rewards.time_penalty += time_penalty;
episode_rewards.vision += vision_reward;
// ...

// End of episode
console.log("Episode Reward Breakdown:", episode_rewards);
```

### Identify Reward Sources

```javascript
if (total_reward > 10 && !caught_anyone) {
  console.warn("⚠️ High reward without catching!");
  console.warn("  Likely reward hacking - check vision reward");
}
```

## Configuration Reference

### Current Rewards (`reward-system.js`)

```javascript
REWARD_CONFIG = {
  // Seeker
  TIME_PENALTY: -0.001,
  SEEKER_SEES_HIDER: 0.01,
  SEEKER_CAUGHT_HIDER: 50.0,
  SEEKER_CAUGHT_ALL: 100.0,
  SEEKER_CAUGHT_NONE: -10.0,

  // Hider
  HIDER_HIDDEN: 0.2,
  HIDER_BEING_SEEN: -0.2,
  HIDER_SURVIVED: 50.0,
  HIDER_CAUGHT: -50.0
};
```

### Reward Ratios

```
Seeker:
  Terminal / Dense = 200.0 / 3.6 = 55.6:1  ✓ Sparse-dominant

Hider:
  Terminal / Dense = 50.0 / 50.4 = 0.99:1  ✓ Balanced

Catching / Watching = 200.0 / 2.4 = 83.3:1  ✓ Strong preference
```

---

**Version**: 1.0
**Last Updated**: November 2024
**Status**: Optimized and Balanced
