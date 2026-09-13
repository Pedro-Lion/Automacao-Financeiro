class BaseFeature {
  constructor(config = {}, adapters = {}) { this.config = config; this.adapters = adapters; this.enabled = true; }
  async initialize(config, adapters) { this.config = config; this.adapters = adapters; }
  filterMessages(messages) { return messages; }
  async process() { return { processed: 0, errors: 0, pendingReview: 0, items: [] }; }
  async generateOutputs() { return { filesWritten: [], filesUpdated: [], errors: [] }; }
  async getPendingReviews() { return []; }
  async handleReview() {}
}
module.exports = { BaseFeature };
