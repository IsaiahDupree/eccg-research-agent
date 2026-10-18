/**
 * The canonical ECCG / event-camera taxonomy.
 *
 * Distilled from https://github.com/uzh-rpg/event-based_vision_resources
 * (top-level sections of the README), then condensed to a flat slug list
 * with keyword anchors used for relevance scoring.
 *
 * Each category has:
 *   - slug         (stable, URL-safe)
 *   - label        (display name)
 *   - keywords     (matched against abstract + title for relevance scoring; case-insensitive)
 *   - prestige     (informational only — some categories like "Survey" rank
 *                   high regardless of citation count)
 */

export interface TaxonomyCategory {
  slug: string;
  label: string;
  keywords: string[];
  notes?: string;
}

export const TAXONOMY: TaxonomyCategory[] = [
  {
    slug: "survey",
    label: "Surveys & Reviews",
    keywords: ["survey", "review", "overview", "tutorial"],
  },
  {
    slug: "feature_tracking",
    label: "Feature Detection & Tracking",
    keywords: [
      "feature detection",
      "feature tracking",
      "keypoint",
      "corner detection",
      "tracking",
    ],
  },
  {
    slug: "optical_flow",
    label: "Optical Flow Estimation",
    keywords: ["optical flow", "flow estimation", "motion estimation"],
  },
  {
    slug: "reconstruction",
    label: "Reconstruction of Visual Information",
    keywords: [
      "image reconstruction",
      "video reconstruction",
      "intensity reconstruction",
      "e2vid",
      "frame reconstruction",
    ],
  },
  {
    slug: "depth",
    label: "Depth Estimation",
    keywords: ["depth estimation", "stereo", "disparity", "monocular depth"],
  },
  {
    slug: "slam",
    label: "SLAM & Visual-Inertial Odometry",
    keywords: ["slam", "vio", "visual-inertial", "odometry", "localization", "mapping"],
  },
  {
    slug: "segmentation",
    label: "Segmentation",
    keywords: ["segmentation", "instance segmentation", "semantic segmentation"],
  },
  {
    slug: "recognition",
    label: "Pattern Recognition & Classification",
    keywords: [
      "classification",
      "recognition",
      "action recognition",
      "gesture",
    ],
  },
  {
    slug: "object_detection",
    label: "Object Detection",
    keywords: ["object detection", "detector", "bounding box", "yolo"],
  },
  {
    slug: "signal_processing",
    label: "Signal Processing & Denoising",
    keywords: ["denoising", "noise filtering", "signal processing", "hot pixel"],
  },
  {
    slug: "control_robotics",
    label: "Control, Obstacle Avoidance, Robotics",
    keywords: [
      "obstacle avoidance",
      "drone",
      "uav",
      "quadrotor",
      "robot",
      "control",
      "manipulation",
    ],
  },
  {
    slug: "neuromorphic_hardware",
    label: "Neuromorphic Hardware & Processors",
    keywords: [
      "loihi",
      "truenorth",
      "spinnaker",
      "neuromorphic processor",
      "memristor",
      "spiking hardware",
    ],
  },
  {
    slug: "snn",
    label: "Spiking Neural Networks",
    keywords: ["spiking neural network", "snn", "spiking", "leaky integrate"],
  },
  {
    slug: "simulator",
    label: "Simulators & Synthetic Data",
    keywords: ["simulator", "synthetic event", "v2e", "esim", "event simulation"],
  },
  {
    slug: "dataset",
    label: "Datasets",
    keywords: ["dataset", "benchmark", "n-cars", "n-mnist", "mvsec", "ddd17", "dsec"],
  },
  {
    slug: "device_sensor",
    label: "Devices & Sensors",
    keywords: [
      "davis",
      "dvs",
      "prophesee",
      "inivation",
      "samsung dvs",
      "event camera sensor",
    ],
  },
  {
    slug: "tactile_other",
    label: "Tactile / Other Sensing",
    keywords: ["tactile", "neurotac", "event tactile"],
  },
];

// Synonyms that signal we're in event-camera territory at all. If none of
// these appear in title+abstract, eccg_relevance should be ~0.
export const ECCG_CORE_KEYWORDS = [
  "event camera",
  "event-based vision",
  "event-based",
  "neuromorphic vision",
  "dynamic vision sensor",
  "dvs",
  "davis",
  "spike camera",
  "asynchronous vision",
  "silicon retina",
] as const;

export function isLikelyEventCameraPaper(text: string): boolean {
  const lower = text.toLowerCase();
  return ECCG_CORE_KEYWORDS.some((k) => lower.includes(k));
}
