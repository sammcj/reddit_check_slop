# Anyone else getting OOM errors with llama.cpp on 24GB VRAM?

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

Running into out-of-memory issues trying to load a Q5_K_M quant of Mixtral 8x22B. My setup:

```
$ nvidia-smi
+-----------------------------------------------------------------------+
| NVIDIA-SMI 560.35.03   Driver Version: 560.35.03   CUDA Version: 12.6 |
| GPU  Name        Persistence-M | Bus-Id        Disp.A | Volatile Uncorr. ECC |
| Fan  Temp   Perf  Pwr:Usage/Cap |         Memory-Usage | GPU-Util  Compute M. |
|   0  NVIDIA GeForce RTX 4090   |   00000000:01:00.0  On |                  N/A |
| 30%   42C    P8    18W / 450W  |   1024MiB / 24564MiB |      0%      Default |
+-----------------------------------------------------------------------+

$ ./llama-server -m models/mixtral-8x22b-q5_k_m.gguf -ngl 99 -c 8192
ggml_cuda_op_mul_mat: not enough VRAM for full offload
```

I've tried reducing context to 4096 and using Q4_K_M instead but still running out. Anyone got tips for splitting layers between GPU and CPU? What -ngl value works for you?


---

# Comparison: Claude 3.5 Sonnet vs GPT-4o vs Gemini 1.5 Pro for code generation

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

I ran the same 50 coding tasks across all three models last week. Here are my results:

| Model | Pass@1 | Avg tokens | Avg latency (s) | Cost per task |
|-------|--------|-----------|-----------------|---------------|
| Claude 3.5 Sonnet | 78% | 1,240 | 3.2 | $0.024 |
| GPT-4o | 72% | 1,580 | 4.1 | $0.031 |
| Gemini 1.5 Pro | 68% | 1,390 | 2.8 | $0.018 |

Tasks were a mix of Python, TypeScript, and Rust. Claude performed best on refactoring and debugging tasks. GPT-4o was stronger on boilerplate generation. Gemini was fastest but made more logic errors.

Methodology: each task was run 3 times, best result counted. Temperature 0 for all. Full dataset and prompts in the linked repo.

---

# My homelab AI inference server build (Threadripper + dual 3090)

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

Just finished my build for running local models. Parts list:

- CPU: AMD Threadripper 7960X (24 cores)
- RAM: 256GB DDR5-5600 ECC
- GPU 1: NVIDIA RTX 3090 24GB
- GPU 2: NVIDIA RTX 3090 24GB
- Storage: 4TB Samsung 990 Pro NVMe
- PSU: Corsair HX1500i
- Case: Fractal Design Meshify 2 XL

Total cost was about $4,200 AUD buying parts over a few months. Thermals are fine with the Meshify's airflow -- GPUs sit at 72C under sustained load with both running inference.

Currently running vLLM with tensor parallelism across both 3090s. Can serve Llama 3 70B Q4 at about 18 tok/s which is good enough for my use case. Happy to answer questions about the build.

---

# vLLM v0.8.0 release notes

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

Changes in this release:

- Added support for Llama 3.2 vision models
- Fixed memory leak in continuous batching scheduler
- Improved prefix caching hit rate by 15-20%
- New chunked prefill implementation reduces TTFT by 30%
- Deprecated Python 3.9 support (will be removed in v0.9.0)
- Fixed race condition in async engine shutdown
- Added Prometheus metrics endpoint for monitoring
- Updated CUDA graphs to support dynamic batch sizes
- Bumped minimum PyTorch version to 2.4.0

Breaking changes:
- `--max-num-seqs` renamed to `--max-num-requests`
- Removed legacy `SamplingParams.n` > 1 path (use beam search API)

Full changelog: github.com/vllm-project/vllm/releases/tag/v0.8.0

---

# Hot take: most "AI coding assistants" are just autocomplete with extra steps

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

I've been using Copilot, Cursor, and a few others for about a year now and honestly the value proposition is overstated. For routine code they save some typing, but for anything requiring actual design thinking they're more hindrance than help.

The real productivity gain isn't from the code generation itself -- it's from having a fast way to look up API docs and get syntax reminders without leaving the editor. That's basically fancy autocomplete.

I know this is a contrarian take here but I'd rather spend time getting better at reading code and understanding systems than learning prompt engineering tricks to coax a model into writing mediocre code slightly faster.

Curious what others think. Am I wrong?

---

# Trying to understand attention mechanisms -- found a good deep dive

_NOTE: This is not a real post, it is a test for the check-slop app to ensure it correctly identifies AI slop posts from real content._

I've been working through the "Attention Is All You Need" paper and struggling with the multi-head attention maths. Found a blog post that walks through the matrix operations step by step with worked examples, which finally made it click for me.

The key insight I was missing: each head learns to attend to different positional or semantic relationships, and the concatenation + linear projection lets the model mix these different "views" of the input. Once I understood that, the rest of the transformer architecture made a lot more sense.

Would recommend to anyone else trying to grok transformers from first principles rather than just using them as a black box. Link in comments if anyone wants it.
