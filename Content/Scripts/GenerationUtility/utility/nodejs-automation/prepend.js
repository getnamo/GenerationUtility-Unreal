const fs = require('fs');
const path = require('path');

// Paths to check and replace
const oldReference = `/// <reference path="../../../../../../Content/Scripts/typings/ue.d.ts" />`;
const newReference = `/// <reference path="../typings/gu.d.ts" />`;

// Get all files in the current directory
fs.readdir(process.cwd(), (err, files) => {
  if (err) {
    return console.error('Unable to read the directory:', err);
  }

  // Process each file
  files.forEach((file) => {
    const filePath = path.join(process.cwd(), file);

    // Check if the file is a file and not a directory
    fs.stat(filePath, (err, stats) => {
      if (err) {
        return console.error('Unable to retrieve file stats:', err);
      }

      if (stats.isFile()) {
        // Read the content of the file
        fs.readFile(filePath, 'utf8', (err, data) => {
          if (err) {
            return console.error('Unable to read file:', err);
          }

          // Check if the old reference exists
          if (data.includes(oldReference)) {
            // Replace old reference with the new one
            const updatedData = data.replace(oldReference, newReference);

            // Write the updated content back to the file
            fs.writeFile(filePath, updatedData, 'utf8', (err) => {
              if (err) {
                return console.error('Unable to write to file:', err);
              }
              console.log(`Updated reference in: ${file}`);
            });
          }
        });
      }
    });
  });
});
