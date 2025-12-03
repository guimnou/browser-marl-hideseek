# PPO Training Guide - Multi-Agent Hide-and-Seek

## Table of Contents

1. [Introduction to PPO](#introduction-to-ppo)
2. [Multi-Agent PPO Setup](#multi-agent-ppo-setup)
3. [Training Algorithm](#training-algorithm)
4. [Hyperparameters Explained](#hyperparameters-explained)
5. [Network Architecture](#network-architecture)
6. [Training Process](#training-process)
7. [Convergence and Learning Curves](#convergence-and-learning-curves)
8. [Troubleshooting](#troubleshooting)

## Introduction to PPO

### What is PPO?

**Proximal Policy Optimization (PPO)** is a state-of-the-art reinforcement learning algorithm developed by OpenAI in 2017. It's designed to be:
- **Simple** - Easier to implement than other policy gradient methods
- **Stable** - Less prone to catastrophic failures during training
- **Sample-efficient** - Learns from limited data more effectively
- **Scalable** - Works well in parallel and distributed settings

### How PPO Works

PPO is a **policy gradient** method that learns by:
1. **Collecting experience** - Agent interacts with environment
2. **Computing advantage** - Estimates which actions were better than expected
3. **Updating policy** - Adjusts neural network to favor good actions
4. **Constraining updates** - Prevents too-large changes that could destabilize learning

### Key Insight: The "Proximal" Part

PPO's innovation is the **clipped objective function** that limits how much the policy can change in one update:

```
L^CLIP(θ) = E[ min(r_t(θ) * A_t, clip(r_t(θ), 1-ε, 1+ε) * A_t) ]

Where:
- r_t(θ) = π_θ(a|s) / π_θ_old(a|s)  (probability ratio)
- A_t = advantage estimate (how good was this action)
- ε = clip parameter (typically 0.2)
```

This prevents the **policy collapse** problem where too-large updates destroy previously learned behavior.

## Multi-Agent PPO Setup

### Why Multi-Agent?

In hide-and-seek, we have **two types of agents** with **conflicting goals**:
- **Seekers**: Want to find and catch hiders
- **Hiders**: Want to avoid being found

This creates a **competitive** (zero-sum) game where:
- Seekers improving → Environment harder for hiders
- Hiders improving → Environment harder for seekers

This is called **multi-agent non-stationarity** - the environment changes as agents learn!

### Separate Policies

We use **two independent policies**:

```python
policies = {
    "seeker_policy": PolicySpec(
        config={
            "lr": 0.0003,
            "entropy_coeff": 0.001  # Low - deterministic seeking
        }
    ),
    "hider_policy": PolicySpec(
        config={
            "lr": 0.0003,
            "entropy_coeff": 0.01   # High - explore hiding spots
        }
    )
}
```

**Policy Mapping**:
```python
def policy_mapping_fn(agent_id, episode, worker, **kwargs):
    if agent_id.startswith("seeker"):
        return "seeker_policy"
    else:
        return "hider_policy"
```

### Why Separate Policies?

1. **Different objectives** - Seekers and hiders have opposite goals
2. **Different exploration needs** - Hiders need to explore more to find hiding spots
3. **Independent learning rates** - Can tune each policy separately
4. **Asymmetric rewards** - Different reward structures for each role

## Training Algorithm

### PPO Update Steps

```
For each training iteration:

1. COLLECTION PHASE (Rollout)
   ├─► For 240 episodes:
   │   ├─► Reset environment
   │   │   └─► Get initial observations for all agents
   │   │
   │   ├─► For 240 timesteps:
   │   │   ├─► Seeker policy: Get action from π_seeker(a|s)
   │   │   ├─► Hider policy: Get actions from π_hider(a|s)
   │   │   ├─► Execute actions in environment
   │   │   ├─► Receive (observations, rewards, done)
   │   │   ├─► Store transition: (s_t, a_t, r_t, s_t+1, done)
   │   │   └─► Compute log_prob(a_t) for PPO update
   │   │
   │   └─► Episode ends (time limit or all hiders caught)
   │
   └─► Collected: 57,600 timesteps (240 episodes × 240 steps)

2. ADVANTAGE COMPUTATION
   ├─► For each trajectory:
   │   ├─► Compute value estimates: V(s_t)
   │   ├─► Compute returns: R_t = Σ γ^k * r_{t+k}
   │   ├─► Compute TD residuals: δ_t = r_t + γ*V(s_{t+1}) - V(s_t)
   │   └─► Compute advantages: A_t = Σ (γλ)^k * δ_{t+k}  (GAE)
   │
   └─► Normalize advantages: A_t = (A_t - mean(A)) / std(A)

3. POLICY OPTIMIZATION (10 epochs)
   ├─► For epoch in [1..10]:
   │   ├─► Shuffle data into minibatches (512 samples)
   │   │
   │   ├─► For each minibatch:
   │   │   ├─► Compute current policy: π_θ(a|s)
   │   │   ├─► Compute ratio: r_t = π_θ(a|s) / π_θ_old(a|s)
   │   │   ├─► Compute clipped objective:
   │   │   │   L^CLIP = min(r_t * A_t, clip(r_t, 0.8, 1.2) * A_t)
   │   │   ├─► Compute value loss:
   │   │   │   L^VF = (V_θ(s) - R_t)^2
   │   │   ├─► Compute entropy bonus:
   │   │   │   L^ENT = -H(π_θ)  (encourages exploration)
   │   │   ├─► Total loss:
   │   │   │   L = -L^CLIP + 0.5*L^VF - entropy_coeff*L^ENT
   │   │   ├─► Backpropagate gradients
   │   │   ├─► Clip gradients (max norm: 0.5)
   │   │   └─► Update parameters: θ ← θ - lr * ∇L
   │   │
   │   └─► Check KL divergence (early stopping if KL > target)
   │
   └─► Update old policy: π_θ_old ← π_θ

4. LOGGING & CHECKPOINTING
   ├─► Log metrics (rewards, entropy, KL, loss)
   ├─► Save checkpoint every 10 iterations
   └─► Generate training plots
```

### Generalized Advantage Estimation (GAE)

GAE is used to compute better advantage estimates:

```
A^GAE(s_t, a_t) = Σ_{k=0}^∞ (γλ)^k * δ_{t+k}

Where:
- δ_t = r_t + γ*V(s_{t+1}) - V(s_t)  (TD residual)
- γ = discount factor (0.99)
- λ = GAE parameter (0.95)
```

**Why GAE?**
- **Bias-variance tradeoff**: λ=0 (low variance, high bias), λ=1 (high variance, low bias)
- **λ=0.95**: Good balance - reduces variance while maintaining accuracy

## Hyperparameters Explained

### Learning Parameters

```yaml
ppo:
  lr_seeker: 0.0003
  lr_hider: 0.0003
```

**Learning Rate (lr)**:
- Controls step size in gradient descent
- **0.0003** is a good default for PPO
- Too high → Unstable training, policy collapse
- Too low → Slow learning, may not converge

**Why separate learning rates?**
- Allows tuning each policy independently
- Can slow down stronger policy if needed
- Currently equal (0.0003 for both)

### Discount Factor & Lambda

```yaml
ppo:
  gamma: 0.99
  lambda: 0.95
```

**Gamma (γ)** - Discount factor:
- How much to value future rewards
- **0.99**: Values rewards 1 second in future at 90% of immediate rewards
- Higher γ → More far-sighted (better for long-term planning)
- Lower γ → More short-sighted (better for immediate rewards)

**Lambda (λ)** - GAE parameter:
- **0.95**: Standard value, good bias-variance tradeoff
- Higher λ → Lower bias, higher variance
- Lower λ → Higher bias, lower variance

### Clipping Parameter

```yaml
ppo:
  clip_param: 0.2
```

**Clip Parameter (ε)**:
- Limits policy ratio to [0.8, 1.2]
- **0.2** is the standard PPO value
- Prevents too-large policy updates
- Key to PPO's stability!

### Value Function Coefficient

```yaml
ppo:
  vf_loss_coeff: 0.5
```

**Value Function Loss Coefficient**:
- Weight of value loss in total loss
- **0.5**: Standard value
- Balances policy improvement with value accuracy

### Entropy Coefficients

```yaml
ppo:
  entropy_coeff_seeker: 0.001
  entropy_coeff_hider: 0.01
```

**Entropy Coefficient** - Encourages exploration:

```
Entropy = -Σ π(a|s) * log(π(a|s))

High entropy = Random actions (exploration)
Low entropy = Deterministic actions (exploitation)
```

**Seeker**: `0.001` (low)
- Seekers benefit from deterministic strategies
- Clear objective: find and chase hiders
- Less exploration needed

**Hider**: `0.01` (10× higher)
- Hiders need to explore to find good hiding spots
- More randomness helps discover novel strategies
- Prevents premature convergence to suboptimal hiding

### Batch Sizes

```yaml
ppo:
  train_batch_size: 57600
  minibatch_size: 512
  num_epochs: 10
```

**Train Batch Size** - Total timesteps before update:
- **57,600 timesteps** = 240 episodes × 240 steps
- Larger batch → More stable gradients, slower updates
- Smaller batch → Faster updates, more noise

**Minibatch Size** - Samples per gradient update:
- **512 samples** per update
- 57,600 / 512 = 112.5 minibatches per epoch
- Larger minibatch → Faster training, less noise
- Smaller minibatch → More updates, more exploration

**Number of Epochs** - Passes over collected data:
- **10 epochs** - Standard for PPO
- More epochs → Better data utilization, risk of overfitting
- Fewer epochs → Faster, risk of underfitting

### Gradient Clipping

```yaml
ppo:
  grad_clip: 0.5
```

**Gradient Clipping** - Prevents exploding gradients:
- Limits gradient norm to **0.5**
- Prevents large parameter updates
- Improves training stability

### KL Divergence Control

```yaml
ppo:
  kl_coeff: 0.3
  kl_target: 0.01
```

**KL Coefficient** - Penalty for policy divergence:
- **0.3**: Moderate penalty
- Adaptive: Increases if KL > target, decreases if KL < target

**KL Target** - Target divergence:
- **0.01**: Small changes preferred
- Early stopping if KL exceeds target
- Prevents policy from changing too fast

## Network Architecture

### Policy Network

```python
model:
  fcnet_hiddens: [256, 256]
  fcnet_activation: "relu"
```

**Architecture**:
```
Input: 161 dimensions (observation)
    ↓
Hidden Layer 1: 256 neurons (ReLU)
    ↓
Hidden Layer 2: 256 neurons (ReLU)
    ↓
Output Layer: 7 neurons (actions)
    ├─► Movement forward: tanh activation → [-1, 1]
    ├─► Movement strafe: tanh activation → [-1, 1]
    ├─► Rotation: tanh activation → [-1, 1]
    ├─► Look: tanh activation → [-1, 1]
    ├─► Jump: sigmoid activation → [0, 1]
    ├─► Place block: sigmoid activation → [0, 1]
    └─► Remove block: sigmoid activation → [0, 1]
```

**Total Parameters**:
```
Layer 1: 161 inputs × 256 neurons = 41,216 weights + 256 biases = 41,472
Layer 2: 256 inputs × 256 neurons = 65,536 weights + 256 biases = 65,792
Output:  256 inputs × 7 neurons = 1,792 weights + 7 biases = 1,799

Total: 109,063 parameters per policy
```

### Value Network

The value network shares the same architecture but outputs a **single value**:

```
Input: 161 dimensions
    ↓
Hidden Layer 1: 256 neurons (ReLU)
    ↓
Hidden Layer 2: 256 neurons (ReLU)
    ↓
Output: 1 neuron (value estimate)
```

### Why This Architecture?

**256-256 hidden layers**:
- **Sufficient capacity** for 161-dim input
- **Not too large** - prevents overfitting
- **Fast inference** - <1ms per forward pass

**ReLU activation**:
- Fast to compute
- No vanishing gradient problems
- Standard choice for deep RL

**Shared backbone** (optional in RLlib):
- Can share early layers between policy and value
- Reduces parameters and speeds up training
- Currently using separate networks

## Training Process

### Episode Structure

```
Episode Duration: 20 seconds (240 timesteps × 83.33ms)

Timeline:
0s ──────────3s──────────────────────────────────────20s
│   COUNTDOWN   │            SEEKING                 │
│   36 steps    │           204 steps                │
│               │                                    │
Hiders hide     Seekers hunt, hiders flee
Seekers wait    Check catching every step
```

### Training Iteration

```
Iteration Timeline (3-5 minutes):

1. Collect 240 episodes (2-3 minutes)
   ├─► Each episode: 20 seconds
   ├─► Total timesteps: 57,600
   └─► GPU idle, browser doing physics

2. Train policies (1-2 minutes)
   ├─► Compute advantages: ~5 seconds
   ├─► 10 epochs × 112 minibatches: ~60 seconds
   ├─► GPU at 40-60% utilization
   └─► Update both seeker and hider policies

3. Checkpoint & logging (10 seconds)
   ├─► Save model: ~5 seconds
   ├─► Generate plots: ~3 seconds
   └─► Garbage collection: ~2 seconds
```

### Multi-Agent Training Dynamics

**Self-Play Learning**:
```
Iteration 1:
  Seeker: Random policy → Can't catch anyone
  Hider: Random policy → Easy to catch

Iteration 10:
  Seeker: Learned to chase → Catches some hiders
  Hider: Learned to run away → Harder to catch

Iteration 30:
  Seeker: Learned to predict movement → Catches most
  Hider: Learned to hide behind obstacles → Harder

Iteration 100:
  Seeker: Sophisticated hunting strategies
  Hider: Complex hiding and fleeing behaviors
  ↓
  Co-evolution continues!
```

**Non-Stationarity Challenge**:
- Environment constantly changing as opponent improves
- Requires continuous adaptation
- Can lead to oscillating performance

**Solution**: Entropy bonuses encourage exploration, preventing convergence to local optima.

## Convergence and Learning Curves

### Expected Learning Curves

#### Seeker Rewards
```
Iteration    Reward    Trend
────────────────────────────
1-10        +5 → +12   Rising (learning to chase)
10-30       +12 → +18  Rising (catching hiders)
30-70       +18 → +31  Rising (better strategies)
70-100      +31 → +38  Plateauing (near optimal)
100+        ~40        Stable (converged)
```

#### Hider Rewards
```
Iteration    Reward    Trend
────────────────────────────
1-10        +12 → +8   Falling (seeker improving)
10-30       +8 → +5    Falling (struggling to hide)
30-70       +5 → -3    Falling (getting caught more)
70-100      -3 → +5    Rising (learned to hide)
100+        ~+8        Stable (adapted to seeker)
```

### Entropy Decay

```
Seeker Entropy:
15.0 (random) → 12.0 → 10.0 → 9.0 → 8.5 (converged)

Hider Entropy:
13.0 (random) → 11.0 → 10.5 → 10.0 → 9.8 (converged)
```

**Interpretation**:
- High entropy (>12): Random, exploring
- Medium entropy (9-12): Learning, still exploring
- Low entropy (<9): Converged, deterministic

### Signs of Good Training

✅ **Healthy training**:
- Rewards increasing over time (for at least one agent)
- Entropy gradually decreasing
- Loss values stabilizing
- No sudden jumps or crashes

❌ **Warning signs**:
- Rewards oscillating wildly
- Entropy stuck at high values
- Loss exploding (>100)
- NaN values in metrics

### Convergence Criteria

Training is converged when:
1. **Rewards stabilize** - No improvement for 50+ iterations
2. **Entropy low** - Both policies <9.0 entropy
3. **Consistent behavior** - Agents execute coherent strategies
4. **Competitive balance** - Neither agent dominates completely

**Typical convergence**: 200-500 iterations (depending on task complexity)

## Troubleshooting

### Problem: Rewards Not Increasing

**Symptoms**:
- Rewards stuck at initial values
- No improvement after 50+ iterations

**Possible Causes**:
1. **Learning rate too low** → Increase to 0.0005
2. **Entropy too low** → Increase entropy_coeff to 0.01
3. **Reward signal too sparse** → Add more dense rewards
4. **Network too small** → Increase to [512, 512]

**Solution**:
```yaml
ppo:
  lr_seeker: 0.0005  # Increase from 0.0003
  lr_hider: 0.0005
  entropy_coeff_seeker: 0.01  # More exploration
  entropy_coeff_hider: 0.02
```

### Problem: Training Unstable (Oscillating Rewards)

**Symptoms**:
- Rewards jump up and down
- Sudden performance collapses
- Entropy increasing instead of decreasing

**Possible Causes**:
1. **Learning rate too high** → Reduce to 0.0001
2. **Batch size too small** → Increase train_batch_size
3. **Too many epochs** → Reduce num_epochs to 5
4. **Gradient explosion** → Reduce grad_clip to 0.3

**Solution**:
```yaml
ppo:
  lr_seeker: 0.0001  # Reduce
  lr_hider: 0.0001
  train_batch_size: 115200  # Double batch size
  num_epochs: 5  # Fewer epochs
  grad_clip: 0.3  # Tighter clipping
```

### Problem: One Agent Dominates

**Symptoms**:
- Seeker always catches all hiders (or vice versa)
- Hider rewards always negative
- No competitive balance

**Possible Causes**:
1. **Reward imbalance** → Tune reward values
2. **Different network sizes needed** → Increase weaker agent's network
3. **Learning rate mismatch** → Give weaker agent higher lr

**Solution**:
```yaml
ppo:
  lr_hider: 0.0005  # Higher for hiders
  entropy_coeff_hider: 0.02  # More exploration

# In reward-system.js:
HIDER_SURVIVED: 100.0  # Increase from 50.0
HIDER_HIDDEN: 0.3  # Increase from 0.2
```

### Problem: GPU Memory Error

**Symptoms**:
```
RuntimeError: CUDA out of memory
```

**Solution**:
1. **Reduce batch size**:
```yaml
ppo:
  train_batch_size: 28800  # Half size
  minibatch_size: 256  # Smaller minibatches
```

2. **Reduce network size**:
```yaml
ppo:
  model:
    fcnet_hiddens: [128, 128]  # Smaller network
```

3. **Use CPU training** (slower):
```yaml
ppo:
  num_gpus: 0  # Force CPU
```

### Problem: NaN Loss

**Symptoms**:
- Loss becomes NaN
- Training crashes
- Rewards become NaN

**Possible Causes**:
1. **Exploding gradients** → Tighten gradient clipping
2. **Division by zero** → Check observation normalization
3. **Learning rate too high** → Reduce lr

**Solution**:
```yaml
ppo:
  grad_clip: 0.1  # Very tight clipping
  lr_seeker: 0.0001
  lr_hider: 0.0001
```

And check observation encoding for invalid values:
```javascript
// In observation-encoder.js
if (!isFinite(value)) {
  console.error("Invalid observation value:", value);
  value = 0.0;  // Fallback
}
```

### Problem: Slow Training

**Symptoms**:
- Iterations taking >10 minutes
- GPU utilization <20%

**Possible Causes**:
1. **Episode collection bottleneck** → Frontend too slow
2. **Too many epochs** → Reduce num_epochs
3. **Large batch size** → Reduce train_batch_size

**Solution**:
1. Check browser performance (should be 60 FPS)
2. Reduce epochs:
```yaml
ppo:
  num_epochs: 5  # Reduce from 10
```
3. Profile to find bottleneck

## Advanced Techniques

### Curriculum Learning

Gradually increase task difficulty:

```python
# Start with flat terrain
if iteration < 100:
    TERRAIN_HEIGHT_RANGE = 1
# Then add hills
elif iteration < 300:
    TERRAIN_HEIGHT_RANGE = 5
# Then full complexity
else:
    TERRAIN_HEIGHT_RANGE = 20
```

### Population-Based Training

Train multiple policies simultaneously:

```python
policies = {
    "seeker_1": PolicySpec(...),
    "seeker_2": PolicySpec(...),  # Different hyperparameters
    "hider_1": PolicySpec(...),
    "hider_2": PolicySpec(...)
}
```

Benefits:
- More diverse behaviors
- Better exploration
- More robust policies

### Reward Shaping

Gradually shift from dense to sparse rewards:

```python
if iteration < 50:
    # Dense rewards (learning)
    SEEKER_SEES_HIDER = 0.05
elif iteration < 200:
    # Medium rewards (transitioning)
    SEEKER_SEES_HIDER = 0.02
else:
    # Sparse rewards (refinement)
    SEEKER_SEES_HIDER = 0.01
```

---

**Version**: 1.0
**Last Updated**: November 2024
