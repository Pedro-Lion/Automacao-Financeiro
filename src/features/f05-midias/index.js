const { BaseFeature } = require('../base-feature');
class F05Midias extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f05_midias'; this.sourceGroupTypes = ['obra']; } }
module.exports = { F05Midias };
