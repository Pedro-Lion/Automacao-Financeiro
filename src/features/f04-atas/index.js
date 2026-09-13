const { BaseFeature } = require('../base-feature');
class F04Atas extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f04_atas'; this.sourceGroupTypes = ['obra']; } }
module.exports = { F04Atas };
