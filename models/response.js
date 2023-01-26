'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Response extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Response.init({
    userId: DataTypes.INTEGER,
    questionId: DataTypes.INTEGER,
    hintsUsed: DataTypes.INTEGER,
    status: DataTypes.BOOLEAN,
    completionTime: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Response',
  });
  return Response;
};