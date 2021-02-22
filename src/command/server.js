const services = require('../modules/services');

module.exports = class ServerCommand {
  execute() {
    services.createWebserverInstance().start();
  }
};
