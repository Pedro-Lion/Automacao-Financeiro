const { BaseFeature } = require('../base-feature');
class F03Quilometragem extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f03_quilometragem'; this.sourceGroupTypes = ['privado']; } }
module.exports = { F03Quilometragem };
