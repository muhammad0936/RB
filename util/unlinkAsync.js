const unlink = require('./deleteFile');
const unlinkAsync = (path) => {
  return new Promise((resolve, reject) => {
    unlink(path, (err) => {
      if (err && err.code !== 'ENOENT') reject(err);
      else resolve();
    });
  });
};

module.exports = unlinkAsync;
