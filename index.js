var convert = require('xml-js');
const handlebars = require('handlebars')
const fs = require('fs')
const swfbr = handlebars.compile(fs.readFileSync('./swfbr-template.txt', 'utf8'))
var xml = fs.readFileSync('./doom6.xml', 'utf8');

const {flatten, find, head, prop, propEq, path, pathEq, defaultTo, isEmpty, compose, not, or, and, sum, type, groupBy, reduce, ifElse, append, assoc, inc, length, equals, join, map, isNil, values, concat} = require('ramda');

var raw = convert.xml2js(xml, {compact: true});
const selection = raw.roster.forces.force.selections.selection

const namePath = ['_attributes', 'name']
const costPath = ['costs', 'cost', '_attributes', 'value']
const isSpecialEquipment = pathEq(namePath, 'Special Equipment')
const isArmyGeneral = pathEq(namePath, 'Army General')
const isModel = pathEq(['_attributes', 'type'], 'model')
const isMount = upgrade => not(isEmpty(upgrade.rules)) &&
      not(isEmpty(upgrade.rules.rule)) &&
      not(isEmpty(defaultTo([], find(pathEq(namePath, 'Harnessed'), upgrade.rules.rule))))
    

const getUpgrades = upgrades => {
  if (!upgrades) {
    return []
  }
  let finalUpgrades;
  if (type(upgrades) === 'Object') {
    finalUpgrades = [upgrades]
  } else {
    finalUpgrades = upgrades
  }
  return finalUpgrades
    .filter(compose(not, isArmyGeneral))
    .filter(compose(not, isSpecialEquipment))
    .filter(compose(not, isModel))
    .filter(compose(not, isMount))
    .map(s => {
      return {
        name: s['_attributes'].name,
        cost: path(costPath, s)
      }
    })
}

const getSpecialEquipment = upgr => {
  const eq = find(isSpecialEquipment, defaultTo([], upgr))
  if (!eq) {
    return []
  }
  return getUpgrades(eq.selections.selection)
}

const isGeneral = a => {
  return compose(not, isEmpty, defaultTo([]), find(isArmyGeneral), defaultTo([]))(a) 
}

const getModels = upgrades => {
  const model = find(isModel, defaultTo([], upgrades))
  if (!model) {
    return {
      count: 0,
      cost: 0
    }
  }
  return {
    count: parseInt(model['_attributes'].number),
    cost: parseInt(model.costs.cost['_attributes'].value)
  }
}

const getMount = upgrades => {
  const mount = find(isMount, defaultTo([], upgrades))
  if (!mount) {
    return;
  }
  return {
    name: path(namePath, mount),
    cost: parseInt(path(costPath, mount))
  }
}

const sumUnitCost = unit => {
  return sum(flatten([
    parseInt(unit.baseCost),
    unit.upgrades.map(u => parseInt(u.cost)),
    unit.special_equipment.map(u => parseInt(u.cost)),
    unit.models.cost,
    unit.mount ? unit.mount.cost : 0
  ]))
}

const hasUpgrades = i => not(and(isEmpty(i.upgrades),
                                 isEmpty(i.special_equipment),
                                 isNil(i.mount)))

const firstOrObject = a => defaultTo(a, head(a))

const arrayify = i => {
  if (type(i) === 'Object') {
    return [i]
  }
  return i
}

const results = selection.map(unit => {
  const upgrades = arrayify(unit.selections.selection)
  const result = {
    name: unit['_attributes'].name,
    baseCost: path(costPath, unit),
    general: isGeneral(upgrades),
    category: firstOrObject(unit.categories.category)['_attributes'].name,
    upgrades: getUpgrades(upgrades),
    special_equipment: getSpecialEquipment(upgrades),
    models: getModels(upgrades),
    mount: getMount(upgrades)
  }

  result.cost = sumUnitCost(result)
  result.hasUpgrades = hasUpgrades(result)
  return result
})
const deduped = reduce((acc, val) => {
  const match = find(a => {
    return equals(a.name, val.name) &&
      equals(a.general, val.general) &&
      equals(a.upgrades, val.upgrades) &&
      equals(a.special_equipment, val.special_equipment) &&
      equals(a.models, val.models)
  }, acc)
  if (!match) {
    return append(val, acc)
  } else {
    match.count = inc(defaultTo(1, match.count))
    return acc
  }
}, [], results)

const grouped = flatten(values(groupBy(prop('category'), deduped)))
console.log(join('', append("Total: " + path(costPath, raw.roster), map(swfbr, grouped))))
