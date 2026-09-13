const { BaseFeature } = require('../base-feature');
class F02Conciliacao extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f02_conciliacao'; this.sourceGroupTypes = []; } }
module.exports = { F02Conciliacao };
