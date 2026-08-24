require('dotenv').config();

module.exports = {
  cognodb: {
    uri: process.env.COGNODB_URI,
    user: process.env.COGNODB_USER || 'cognodb',
    password: process.env.COGNODB_PASSWORD,
  },
  port: process.env.PORT || 3000,
};
