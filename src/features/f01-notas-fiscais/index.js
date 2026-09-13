const { BaseFeature } = require('../base-feature');
class F01NotasFiscais extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f01_notas_fiscais'; this.sourceGroupTypes = ['nf']; } }
module.exports = { F01NotasFiscais };
