'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      userId: {
        type: Sequelize.STRING,
        allowNull: false
      },
      quizId: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });

    await queryInterface.addConstraint('Users', {
      fields: ['userId', 'quizId'],
      type: 'unique',
      name: 'unique_user_quiz'
    });
    
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.removeConstraint("Users", "unique_user_quiz");
    await queryInterface.dropTable('Users');
  }
};