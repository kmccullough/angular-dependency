var _  = require('lodash');


function AlreadyDefined (module, file) {
  this.name = 'AlreadyDefined';
  this.message = ['The module: ', module.name, ' defined in ', file,
    ' has already been defined in ', module.defined].join('');
}
AlreadyDefined.prototype = Error.prototype;


function NotDefined (module) {
  this.name = 'NotDefined';
  var message = ['The module ', module.name, ' has not been defined'];
  if (module.contents.length) {
    message.splice(2,0, ' used in ', module.contents.join(', '));
  }
  this.message = message.join('');
}
NotDefined.prototype = Error.prototype;


function CircularDependency (module, dependency) {
  this.name = 'CircularDependency';
  this.message = ['There is a circular dependency between ', module.name,
    ' and ', dependency.name].join('');
}
CircularDependency.prototype = Error.prototype;


function AngularModules () {
  this.modules = {};
}

AngularModules.prototype = {
  addModule: function (name, dependencies, file) {
    var module = this.modules[name];
    if (!module) {
      module = this.modules[name] = {
        name         : name,
        defined      : null,
        dependencies : null,
        contents     : []
      };
    }

    if (dependencies instanceof Array) {
      if (module.defined) {
        throw new AlreadyDefined(module, file);
      }
      module.dependencies = dependencies;
      module.defined = file;
    } else {
      file = dependencies;
      if (module.defined !== file) {
        module.contents.push(file);
      }
    }
    return module;
  },

  resolve: function (module, flat) {
    //copy this.modules in order to not modify it in the resolve function
    function copyModules () {
      var modules = {};
      _.each(this.modules, function (module) {
        modules[module.name] = {
          name         : module.name,
          defined      : module.defined,
          dependencies : _.map(module.dependencies),
          contents     : _.map(module.contents)
        };
      });
      _.each(modules, function (module) {
        module.dependencies =
          _.map(module.dependencies, function (dependency) {
            return modules[dependency];
          });
      });
      return modules;
    }

    /*
     see http://www.electricmonk.nl/log/2008/08/07/dependency-resolving-algorithm/
     */
    function walk (module, resolved, unresolved) {
      unresolved.push(module);
      _.each(module.dependencies, function (dependency) {
        if (!_.find(resolved, {name: dependency.name})) {
          if (_.find(unresolved, {name: dependency.name})) {
            throw new CircularDependency(module, dependency);
          }
          walk (dependency, resolved, unresolved);
        }
      });
      resolved.push(module);
      _.remove(unresolved, function (m) {
        return m.name === module.name;
      });
    }

    var modules = copyModules.call(this);
    var resolved = [];
    module = modules[module.name || module];
    walk(module, resolved, []);

    return flat ? resolved : module;
  }
};

function AngularModulesFactory () {
  var _angularModules = null;
  var module_declaration =
    /angular\.module\((?:'|")(.*?)(?:'|"),\[([^\]]*)\][^\)]*/gi;
  var module_content = /angular\.module\((?:'|")([^']*)(?:'|")[^\[]*?\)/gi;

  function retrieveDependencies (str) {
    var dependencies = str.split(',');
    if (!dependencies[0]) { return []; }
    return _.map(dependencies, function (dependency) {
      return dependency.trim().slice(1, -1);
    });
  }

  function exceptionDecorator (f) {
    return function () {
      try {
        return f.apply(this, arguments);
      } catch (e) {
        _angularModules = null;
        throw e;
      }
    };
  }

  this.processFile = exceptionDecorator(function (content, path) {
    var results;
    if (!_angularModules) { _angularModules = new AngularModules(); }

    content = content.replace(/\s/g, '');

    while ((results = module_declaration.exec(content)) !== null) {
      _angularModules.addModule(results[1], retrieveDependencies(results[2]), path);
    }

    while ((results = module_content.exec(content)) !== null) {
      _angularModules.addModule(results[1], path);
    }
  });

  this.getAngularModules = exceptionDecorator(function () {
    var angularModules = _angularModules;
    _.each(angularModules.modules, function (module) {
      if (!module.defined) {
        throw new NotDefined(module);
      }
    });
    _angularModules = null;
    return angularModules;
  });
}

module.exports = {
  AngularModulesFactory: AngularModulesFactory,
  errors: {
    AlreadyDefined: AlreadyDefined,
    NotDefined: NotDefined,
    CircularDependency: CircularDependency
  }
};