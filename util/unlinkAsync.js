const fs = require('fs');
const unlink = require('./deleteFile');

const unlinkAsync = (path) => {
  return new Promise((resolve, reject) => {
    fs.access(path, fs.constants.F_OK, (err) => {
      if (err) {
        if (err.code === 'ENOENT') resolve(); // File doesn't exist, resolve
        else reject(err); // Other error, reject
      } else {
        unlink(path, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    });
  });
};

module.exports = unlinkAsync;
