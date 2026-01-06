# UI Contract - State Handling Standards

To ensure a "Golden Path" user experience, all feature-driven pages and complex components must implement the following state contract.

## 1. Initial State
- **Rule**: Data should never "jump" into view.
- **Pattern**: Use `Skeleton` loaders that match the final content structure.

## 2. Empty State
- **Component**: `EmptyState`
- **Requirements**:
    - **Visual**: Minimalist icon/illustration.
    - **Copy**: Clear explanation of why there's no data.
    - **CTA**: Direct action to resolve the empty state (e.g., "Connect AWS", "Create Project").

## 3. Loading State
- **Pattern**: 
    - Full-page transitions: Progress bar or skeleton.
    - Inline actions (Buttons): Use `isLoading` prop with spinner.

## 4. Error State
- **Component**: `ErrorState`
- **Requirements**:
    - **Context**: Map technical errors to user-friendly messages.
    - **Recovery**: Always provide a "Retry" or "Back to Safety" button.
    - **Audit**: Log the error details with tracing ID (internal only).

## 5. Success State
- **Component**: `SuccessState` / `Toast`
- **Requirements**:
    - **Confirmation**: High-contrast checkmark.
    - **Next Step**: Provide context on what happened or what's next.

## 6. Action Blocked (Guard)
- **Component**: `ActionBlocked`
- **Use Case**: Feature gating, RBAC limits, or missing dependencies.
- **Visual**: Greyscale overlay + informative tooltip.

---

### Example Implementation

```tsx
if (isLoading) return <LoadingSkeleton />;
if (error) return <ErrorState onRetry={fetchData} />;
if (data.length === 0) return <EmptyState title="No Integrations Found" cta="Add one" />;

return <IntegrationTable items={data} />;
```
