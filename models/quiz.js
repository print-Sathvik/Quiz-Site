'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Quiz extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }

    async changeStatus(id, status) {
      status = 1 - status;
      return await Quiz.update(
        { status },
        {
          where: {
            id,
          },
        }
      );
    }
  }
  Quiz.init({
    title: DataTypes.STRING,
    adminId: DataTypes.INTEGER,
    key: DataTypes.STRING,
    timer: DataTypes.INTEGER,
    score: DataTypes.INTEGER,
    penalty: DataTypes.INTEGER,
    status: DataTypes.INTEGER
  }, {
    sequelize,
    modelName: 'Quiz',
  });
  return Quiz;
};