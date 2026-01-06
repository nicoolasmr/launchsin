# LaunchSin Design System

Modern, minimalist infrastructure UI with a high-end feel.

## Design Tokens

### Colors
- **Brand**: Signature LaunchSin Blue (`#0ea5e9`).
- **Surface**: Scales from Neutral 50 (Paper) to 950 (Obsidian).
- **Semantic**: Emerald for healthy/success, Amber for warnings/predictive drift, Rose for errors.

### Typography
- **Primary**: Geist Sans (Clean, tabular-friendly).
- **Mono**: Geist Mono (For telemetry and IDs).
- **Scale**: Bold, tight tracking for headers; condensed uppercase for labels.

## Core Components

### Atoms
- `Button`: Primary, Secondary, Outline, Ghost.
- `Card`: Bordered, Minimal shadow, Glass variant.
- `Badge`: Status-colored indicators.

### Signature
- `ConfidenceBadge`: Real-time AI confidence score (0-100).
- `GoldenRuleCard`: AI-enforced infrastructure rules with evidence.

### UI Contract
Mandatory patterns for data fetching and feature gates:
- `LoadingState`
- `EmptyState`
- `ErrorState`
- `SuccessState`
- `ActionBlocked`
