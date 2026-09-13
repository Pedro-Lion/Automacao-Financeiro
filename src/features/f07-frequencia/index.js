const { BaseFeature } = require('../base-feature');
class F07Frequencia extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f07_frequencia'; this.sourceGroupTypes = ['obra']; } }
module.exports = { F07Frequencia };
