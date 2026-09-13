const { BaseFeature } = require('../base-feature');
class F08Terceirizados extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f08_terceirizados'; this.sourceGroupTypes = ['obra']; } }
module.exports = { F08Terceirizados };
