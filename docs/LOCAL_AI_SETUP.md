Developer Local AI Environment — Aether Context
===============================================

Purpose
-------

This document records the local AI environment described by the developer during the Aether planning conversation. It is a point-in-time snapshot, not a guarantee that every version, path, mount or service is unchanged. Before running commands, verify the current state. Do not blindly reinstall or replace working components.

Developer hardware snapshot
---------------------------

- Laptop: HP Victus 16-s0x.
- CPU: AMD Ryzen 7 7840HS, 8 cores / 16 threads.
- Discrete GPU: NVIDIA GeForce RTX 3050 Laptop GPU, 6 GB VRAM, reported 60 W power cap.
- Integrated GPU: AMD Radeon 780M.
- RAM: roughly 16 GB physical class; `free -h` showed 14 GiB total in the reported environment.
- OS: Arch Linux x86_64.
- Desktop/compositor: Hyprland on Wayland is used; KDE Plasma has also been used.
- Shell: Fish. Do not alter `~/.config/fish/config.fish` as part of Aether setup.
- Phone: OnePlus Nord 5, OxygenOS, Snapdragon 8s Gen 3, 8 GB physical RAM plus virtual-memory expansion was reported. Verify current details before relying on them for mobile inference planning.

Local model-storage layout
--------------------------

The developer prefers large models on a separate D partition rather than the Linux root partition:

    /mnt/d/AI/models/
        ├── Josiefied-Qwen3-8B/
        │   ├── Josiefied-Qwen3-8B-abliterated-v1-q4_k_m.gguf
        │   └── Modelfile (location should be verified)
        ├── Qwen3-14B-Abliterated/
        │   ├── qwen3-14b-abliterated-Q5_K_M.gguf (verify exact filename/state)
        │   └── Modelfile (location should be verified)
        ├── blobs/       # Ollama-managed internal content-addressed data; do not hand-edit
        └── manifests/   # Ollama-managed model manifests; do not hand-edit

The D partition was shown mounted at `/mnt/d` from `/dev/nvme0n1p5` using `fuseblk`/NTFS, with about 105 GB free at one point. Verify with `findmnt /mnt/d`, `df -h /mnt/d` and `lsblk` before large downloads. NTFS mount ownership/permission behavior is controlled by mount options. Do not assume a Linux `chown` will behave like it does on ext4.

The Linux root partition was shown as `/dev/nvme0n1p7`, 102 GB, with around 26 GB free after cleanup at one point. Verify current capacity before installing runtimes or downloading files.

Ollama installation (reported snapshot)
---------------------------------------

The Arch package `ollama 0.32.9-1` was removed because it contained CPU backends but not the CUDA backend needed by the developer. The developer downloaded the official Linux archive to `/tmp/ollama-linux-amd64.tar.zst`, verified its archive contained `cuda_v12` and `cuda_v13` libraries, and extracted it under `/opt/ollama`.

Reported paths:

- Executable: `/opt/ollama/bin/ollama`
- Command symlink: `/usr/local/bin/ollama` -> `/opt/ollama/bin/ollama`
- Runtime libraries: `/opt/ollama/lib/ollama/`, including CUDA libraries.
- Version reported at setup: `0.32.9`.

This manual installation is outside pacman's package ownership. Future updates should be deliberate: do not install/remove Arch Ollama packages or overwrite `/opt/ollama` blindly. Re-check the official installation/update mechanism and back up the current service configuration before changing it.

User systemd service
--------------------

A user-level systemd service was configured at:

    ~/.config/systemd/user/ollama.service

Expected contents from the reported setup:

    [Unit]
    Description=Ollama Local LLM Server
    After=network-online.target
    Wants=network-online.target

    [Service]
    ExecStart=/usr/local/bin/ollama serve
    Environment="OLLAMA_MODELS=/mnt/d/AI/models"
    Environment="OLLAMA_HOST=127.0.0.1:11434"
    Restart=on-failure
    RestartSec=3

    [Install]
    WantedBy=default.target

Expected checks:

    systemctl --user status ollama --no-pager
    systemctl --user show ollama -p Environment
    journalctl --user -u ollama -n 50 --no-pager
    ss -ltnp | grep 11434
    ollama list
    ollama ps

Expected model environment:

    OLLAMA_MODELS=/mnt/d/AI/models
    OLLAMA_HOST=127.0.0.1:11434

A manual `ollama serve` was once left running while the systemd service was started. This caused `bind: address already in use`. The resolution was to stop the old manually launched server and let the user service own port 11434. In normal use, manage it through `systemctl --user`; do not start a second manual server on the same address/port.

Current known model names
-------------------------

At the time of setup:

- `josiefied-qwen3:latest` — based on Josiefied Qwen3 8B Abliterated v1 Q4 GGUF.
- `qwen3-14b-abliterated:latest` — based on RootMonsteR Qwen3-14B-Abliterated Q5_K_M GGUF.

The developer said the 14B model was decently fast but spends significant time thinking. This was a subjective observation on the reported setup, not a formal benchmark.

Important Ollama storage behavior
---------------------------------

The original downloaded GGUF is portable source material. When importing a GGUF with a Modelfile using `ollama create`, Ollama creates content-addressed internal model data in the `OLLAMA_MODELS` store. Therefore, a single model may consume both:

- the original GGUF in its descriptive subfolder; and
- Ollama-managed blobs/manifests in `/mnt/d/AI/models`.

This duplication is expected for the import workflow. An extra blob from the first import was identified as unreferenced by the current manifest and removed only after stopping the Ollama service and checking manifest references. That cleanup was specific to the then-current store. **Do not generalize this into permission to manually delete blobs.** Newer/other blobs may be shared or referenced. Use supported provider/runtime removal and pruning operations.

Model installation pattern used manually
----------------------------------------

For a local GGUF, the developer used a folder on D, a Modelfile and Ollama create. Example pattern:

    mkdir -p /mnt/d/AI/models/ExampleModel
    cd /mnt/d/AI/models/ExampleModel
    # Place the GGUF here.
    printf 'FROM ./example.gguf\n' > Modelfile
    ollama create example-model -f Modelfile

The Modelfile must be in the directory from which the relative `FROM ./example.gguf` resolves correctly. An absolute path in `FROM` also works when the file is stored elsewhere. Avoid creating `~/Modelfile` unintentionally; use `pwd`, `realpath` and `ls` to verify locations.

Ollama model configuration, generated templates and tool calling should be verified against current Ollama docs and the specific model's GGUF metadata. Avoid replacing embedded chat templates without understanding the model's requirements.

Standalone helper script
------------------------

The developer created a Fish script at:

    ~/.local/bin/ai-models

and a Fish completion file at:

    ~/.config/fish/completions/ai-models.fish

A `/usr/local/bin/ai-models` symlink was also created at one point. `type -a ai-models` previously reported both paths; this duplicate may still exist. Verify before editing/removing anything:

    type -a ai-models
    ls -l ~/.local/bin/ai-models /usr/local/bin/ai-models
    sha256sum ~/.local/bin/ai-models /usr/local/bin/ai-models

The script evolved from basic model installation/list/run/storage commands to a basic benchmark/monitor manager. The first benchmark implementation uses wall-clock timings for a small prompt set and explicitly does NOT calculate proper tokens per second. Do not treat those times as a rigorous performance benchmark. Improve it only after inspecting the actual file. Fish completion for top-level commands was verified via `complete -C 'ai-models '`; runtime Tab behavior appeared to work. The completion file can still be inspected if completion behavior changes.

Useful commands
---------------

Verify system/hardware:

    free -h
    lscpu
    nvidia-smi
    lsblk -o NAME,FSTYPE,SIZE,FSAVAIL,MOUNTPOINTS
    findmnt /mnt/d
    df -h / /mnt/d

Verify Ollama:

    ollama --version
    ollama list
    ollama ps
    ollama show MODEL
    systemctl --user status ollama --no-pager
    journalctl --user -u ollama -n 50 --no-pager

Inspect storage (read-only):

    du -sh /mnt/d/AI/models
    du -h --max-depth=2 /mnt/d/AI/models 2>/dev/null | sort -h | tail -30
    du -sh ~/.cache ~/.local/share ~/.ollama 2>/dev/null

Do not run cleanup commands against `blobs/`, `manifests/`, `~/.cache`, or system paths without inspecting their contents and explaining the effect. Never install the full CUDA toolkit merely because Ollama needs NVIDIA inference; the reported official Ollama archive included its own CUDA runtime libraries. Re-check current supported installation choices before updates.

Aether's relationship to this setup
-----------------------------------

Aether should initially talk to the configured Ollama server through a provider interface. It MUST NOT assume this specific D path on other users' machines. The local endpoint is a default only, and users can add other endpoints. Aether should detect the configured model store when it is available through supported provider/native capabilities, not guess paths from the developer's laptop.

Aether source code belongs in a separate development directory such as `~/Projects/aether`. Do not put the repository inside `/mnt/d/AI/models`, and do not commit model files, local histories, credentials, logs or backups.

Android and Termux notes
------------------------

Do not assume the developer's desktop Ollama/CUDA installation can be replicated unchanged on Android. A phone has different CPU/GPU/NPU/runtime constraints, Android storage permissions and background execution rules. Reasonable options to evaluate at that phase:

- A native Android app using a supported mobile local-inference runtime (for example, a llama.cpp-based integration) and model files saved under an Android app-accessible location.
- A Termux-hosted runtime, if the chosen runtime is supported on the current Android/Termux setup; Aether connects to its localhost endpoint. This is an optional advanced workaround, not the default for all users.
- A LAN/remote server connection to the developer's desktop/server, with explicit trusted-network setup and authentication/firewall guidance.

Do not promise a model will run well on the phone merely because it runs on the laptop. Profile memory, thermals, battery and token throughput separately. Verify current Android support, build instructions and licensing at implementation time.

Known cautions
--------------

- The laptop has had prior graphics/boot trouble involving hybrid AMD/NVIDIA graphics, a black screen, kernel choices and `nomodeset`. Aether work should not alter kernel parameters, NVIDIA drivers, compositor settings or boot configuration as part of routine model setup.
- Do not upgrade or remove system graphics packages to build Aether unless the user explicitly asks and the change is verified.
- Always use absolute paths for model storage and confirm `pwd` when using relative Modelfile paths.
- Keep the local model store out of Git.
