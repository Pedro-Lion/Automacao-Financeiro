const { BaseFeature } = require('../base-feature');
class F06Estoque extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f06_estoque'; this.sourceGroupTypes = []; } }
module.exports = { F06Estoque };
