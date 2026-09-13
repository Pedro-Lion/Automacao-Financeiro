const { BaseFeature } = require('../base-feature');
class F09Agendamento extends BaseFeature { constructor(config, adapters) { super(config, adapters); this.name = 'f09_agendamento'; this.sourceGroupTypes = ['nf', 'obra', 'gestores', 'privado']; } }
module.exports = { F09Agendamento };
