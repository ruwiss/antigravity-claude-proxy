/**
 * Model Manager Component
 * Handles model configuration (pinning, hiding, aliasing, mapping)
 * Registers itself to window.Components for Alpine.js to consume
 */
window.Components = window.Components || {};

window.Components.modelManager = () => ({
    // Track which model is currently being edited (null = none)
    editingModelId: null,

    init() {
        // Component is ready
    },

    /**
     * Start editing a model's mapping
     * @param {string} modelId - The model to edit
     */
    startEditing(modelId) {
        this.editingModelId = modelId;
    },

    /**
     * Stop editing
     */
    stopEditing() {
        this.editingModelId = null;
    },

    /**
     * Check if a model is being edited
     * @param {string} modelId - The model to check
     */
    isEditing(modelId) {
        return this.editingModelId === modelId;
    },

    /**
     * Update model configuration (delegates to shared utility)
     * @param {string} modelId - The model ID to update
     * @param {object} configUpdates - Configuration updates (pinned, hidden, alias, mapping)
     */
    async updateModelConfig(modelId, configUpdates) {
        return window.ModelConfigUtils.updateModelConfig(modelId, configUpdates);
    }
});
