# ECCG Library — 2026-05-16

*Generated from the shared Drive library. 6 papers.*

---

## 1. v2e-Lite: Energy-Efficient Frame-to-Event Conversion for Edge Deployments

**Authors:** Tobi Delbruck, Yuhuang Hu
**Venue:** ICRA · this month
**Category:** Simulator
**Rubric score:** 73 / 100
**Community vote:** ↑2 / ↓0 (net +2)
**Link:** [https://arxiv.org/abs/2405.02244](https://arxiv.org/abs/2405.02244)
**Saved by:** rick on 5/16/2026

**Abstract.**

Synthetic event generation from RGB video is widely used to bootstrap event-camera learning, but classical v2e simulators are too slow for on-device pretraining. We present v2e-Lite, an 8-bit quantised frame-to-event simulator that runs at 540 fps on a Jetson Orin Nano while preserving 96% of the event-Jaccard fidelity of the original. We demonstrate downstream gains on three event-based tasks after pretraining with v2e-Lite-generated events.

**Team notes:**

- _alexis, 5/16/2026, 5:50:45 PM:_ Make this the default simulator in any tutorial we put together. The Jetson Orin Nano price point is what makes event-camera curricula accessible at our scale.

---

## 2. Towards a Tier-1 Spike Camera: 100-kfps Asynchronous Imaging at 6.5 megapixels

**Authors:** Zhe Wang, Tiejun Huang
**Venue:** Nature Electronics · 4 mo ago
**Category:** Device Sensor
**Rubric score:** 57 / 100
**Community vote:** ↑1 / ↓0 (net +1)
**Link:** [https://arxiv.org/abs/2401.05572](https://arxiv.org/abs/2401.05572)
**Saved by:** isaiah on 5/16/2026

**Abstract.**

We report a 6.5-megapixel spike-driven imaging sensor that emits per-pixel asynchronous spike trains at an effective rate of 100,000 frames/s under daylight illumination. Each pixel uses a Pulse-Frequency-Modulation readout coupled to a 4T charge-domain reset. We characterize dynamic range (>140 dB), motion blur, and end-to-end latency on a drone obstacle-avoidance benchmark and outperform a Prophesee Gen-4 sensor by 18 ms at equal accuracy.

**Team notes:**

- _isaiah, 5/16/2026, 5:50:43 PM:_ 140 dB dynamic range + 100 kfps means we're past the prototype phase for spike cameras. Worth a deeper dive on whether the pixel architecture is open enough to drop into v2e-Lite.

---

## 3. DSEC-Flow: A Large-Scale Driving Dataset for Event-Based Optical Flow

**Authors:** Mathias Gehrig, Davide Scaramuzza
**Venue:** IEEE RA-L · 3 mo ago
**Category:** Dataset
**Rubric score:** 68 / 100
**Community vote:** ↑2 / ↓0 (net +2)
**Link:** [https://arxiv.org/abs/2402.01133](https://arxiv.org/abs/2402.01133)
**Saved by:** alexis on 5/16/2026

**Abstract.**

We release DSEC-Flow, a 12-hour driving dataset captured with a stereo Prophesee Gen-4 event camera rig synchronized to a frame camera. Pixel-accurate optical flow ground truth is generated via a high-precision LiDAR reprojection pipeline. DSEC-Flow contains 1.2 million labeled event-flow pairs across day, night, tunnel, and rain conditions — 4× the size of MVSEC. We benchmark seven existing event-based optical flow methods and show that performance degrades by 32% under low-light conditions where DSEC-Flow is largest. Dataset, evaluation server, and baseline checkpoints are public.

**Team notes:**

- _alexis, 5/16/2026, 5:50:42 PM:_ Low-light split is where every method drops 32 %. If we anchor a shared leaderboard on DSEC-Flow's lighting filters, we'll see who's actually robust vs. who's overfit to daylight.

---

## 4. Asynchronous Spiking Object Detection on Loihi 2 for Drone Collision Avoidance

**Authors:** Antonio Vitale, Chiara Bartolozzi, Garrick Orchard
**Venue:** Science Robotics · 2 mo ago
**Category:** Control Robotics
**Rubric score:** 66 / 100
**Community vote:** ↑2 / ↓0 (net +2)
**Link:** [https://arxiv.org/abs/2403.11421](https://arxiv.org/abs/2403.11421)
**Saved by:** rick on 5/16/2026

**Abstract.**

We deploy a fully asynchronous spiking object detector on Intel's Loihi 2 neuromorphic chip and integrate it with a 250-gram quadrotor for end-to-end on-board collision avoidance. The network ingests raw DVS events at 1 MHz, predicts bounding boxes through a spiking YOLO-style head, and emits motor commands every 4 ms. Closed-loop flight tests in cluttered indoor environments show a 92% obstacle-avoidance success rate at 6 m/s — a 38% improvement over the strongest GPU baseline at 8× lower power. We make all chip configurations public.

**Team notes:**

- _rick, 5/16/2026, 5:50:40 PM:_ Reach out to Antonio about the chip configs they're sharing. This is the proof-point that the spiking-on-neuromorphic loop closes end-to-end at real-time.

---

## 5. EventSLAM-GS: Event-Based SLAM with 3D Gaussian Splatting

**Authors:** Lukas Koestler, Daniel Cremers
**Venue:** arXiv preprint · 1 mo ago
**Category:** Slam
**Rubric score:** 69 / 100
**Community vote:** ↑2 / ↓0 (net +2)
**Link:** [https://arxiv.org/abs/2404.10112](https://arxiv.org/abs/2404.10112)
**Saved by:** isaiah on 5/16/2026

**Abstract.**

We present EventSLAM-GS, the first event-based SLAM system that builds a dense 3D Gaussian-splatting map online from a single DVS camera. By coupling event-rate-adaptive tracking with a differentiable Gaussian renderer we recover both pose and a photometrically consistent map without intensity frames. On TUM-VI-EVS our trajectories match frame-based ORB-SLAM3 within 6% RMSE while reconstructing 1.4 M Gaussians at 10 Hz. Source code released.

**Team notes:**

- _isaiah, 5/16/2026, 5:50:38 PM:_ Online tracking at event rate is the unlock. We should benchmark it against ORB-SLAM3 on the DSEC-Flow night splits — see if the 6 % RMSE claim holds where every other method drops 32 %.

---

## 6. A Decade of Event-Based Vision: A Survey of 1200 Papers

**Authors:** Guillermo Gallego, Tobi Delbruck, Garrick Orchard
**Venue:** TPAMI · 3 mo ago
**Category:** Survey
**Rubric score:** 78 / 100
**Community vote:** ↑4 / ↓0 (net +4)
**Link:** [https://arxiv.org/abs/2402.18221](https://arxiv.org/abs/2402.18221)
**Saved by:** isaiah-test on 5/16/2026

**Abstract.**

We survey the past decade of event-based vision, organising 1,200 papers across feature tracking, optical flow, reconstruction, depth, SLAM, segmentation, classification, control, datasets, simulators, and hardware. We trace 38 sub-trends, identify 14 open problems, and provide a dataset taxonomy with download links. This is the first community-driven update to the 2020 TPAMI survey and includes papers up to 2026.

**Team notes:**

- _isaiah-test, 5/16/2026, 5:14:00 PM:_ Smoke test note from prod CI ensuring Drive write works.
- _rick, 5/16/2026, 5:50:37 PM:_ Replace the static spreadsheet with this. It already organises 1,200 papers across the 14 open problems we're tracking — our weekly review can start here every week.

---
