var fs = require("fs"),
    async = require('../flow/flow.js'),
    path,
    files = [],
    callbacks = [];

if(process.argv.length < 3) {
  console.error("You must specify at least one audio file or flat directory of audio files to process.");
  process.exit();
}

path = process.argv[2];
files = directoryOrFile(path).filter(Boolean);
functions = async.buildFnList(files,openFile,null);

async.throttle(5,functions,processWavFromBuffers);

/* 
 * Reads headers from a WAV file.  Currently this only processes
 * RIFF type canonical headers, ie, ones with and AudioFormat of PCM and
 * containing no additional "filler" or offset headers.
 */
function decodeWav(buffer) {
  var chunkId,
      headers;

  chunkId = buffer.toString('utf8',0,4);  
  
  if(chunkId !== "RIFF") {
    console.error("Not a valid wav file.");
    process.exit();  
  } 

  headers['ChunkId'] = chunkId;
  headers['ChunkSize'] = buffer.readUInt32LE(4);
  headers['Format - fmt '] = buffer.toString('utf8',8,12);
  headers['Subchunk1Id'] = buffer.toString('utf8',12,15);
  headers['Subchunk1Size'] = buffer.readUInt32LE(16);
  headers['AudioFormat'] = buffer.readUInt16LE(20);
  headers['NumChannels'] = buffer.readUInt16LE(22);
  headers['SampleRate'] = buffer.readUInt32LE(24);
  headers['ByteRate'] = buffer.readUInt32LE(28);
  headers['BlockAlign'] = buffer.readUInt16LE(32);
  headers['BitsPerSample'] = buffer.readUInt16LE(34);
  headers['Subchunk2Id - data'] = buffer.toString('utf8',36,40);
  headers['Subchunk2Size'] = buffer.readUInt32LE(40);

  console.log("Header information: ")
  console.log(headers)
  
  //return headers;
};

/*
 * Determines if the user has supplied a single file or a directory of files.
 * This doesnt check if the directory is flat or not--it is assumed the user
 * has read the comments and supplied a flat directory of files.
 *
 * In case of single file, path variable is re-assigned without the file's name.
 */
function directoryOrFile(pathName) {
  var files = [];

  try {
    files = fs.readdirSync(pathName);
  } catch(error) {
    if(error.code === "ENOTDIR") {
      file = pathName.split('/').splice(-1,1)[0];
      path = pathName.split('/').slice(0,-1).join('/')

      files = [file];      
    } else {
      throw error;
    }
  }
  return files.length === 1 ? files : files.map(removeHiddenFiles); 
}

/*
 * Gets rid of hidden files or directories, DS_STORE, etc.
 */
function removeHiddenFiles(name) {
  if(!(name[0] === '.')) {
    return name;
  }
}

/*
 * Reads a file in a buffer, then removes the first 44 bytes.
 * Assumes a canonical wav header implemetation.
 */
function openFile(file,fn) {
  fs.readFile(path + '/' + file, returnHeadlessWav);

  function returnHeadlessWav(error,data) {
    if(error) {
      throw error;
    }
      
    buffer = new Buffer(data); 

    if(buffer.length <= 1) {
      console.error("File to small.");
      process.exit();
    }
    return fn(buffer.slice(44));  
  }
}

/*
 * Write wav headers
 */
function writeWavHeaders(length,data) {
  var buffer = new Buffer(44 + length);
  var view = new DataView(buffer)
  
  function writeString(offset, string) {
    var i = 0,
        length = string.length;
                
    for (i; i < length; i++){
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }
  // chunkID
  writeString(0, "RIFF");
  //chunksize
  view.setUint32(4, 36 + length, true) 
  //format
  writeString(8, "WAVE");
  //subchunkid
  writeString(12, "fmt ");
  //subchunk1 size
  view.setUint32(16, 16, true); 
  //audio format
  view.setUint16(20,1,true);
  //numchannels 
  view.setUint16(22,1,true);
  //sample rate
  view.setUint32(24, 44100, true);
  //byte rate
  view.setUint32(28, 44100 * 2, true);
  //block align
  view.setUint16(32, 2, true);
  //bits per sample
  view.setUint16(34, 16, true);
  //subchunkid2
  writeString(36,'data');
  //subchnk2
  view.setUint32(40, length, true);

  data.copy(buffer,44);
  return buffer
}

/*
 * Computes the total length of all headless buffers, then creates
 * a new buffer from those buffers, writes proper headers and 
 * writes a new wav to the filesystem.
 */
function processWavFromBuffers(arrays) {
  var totalLength = 0,
      buffer,
      wav;

  arrays.forEach(function(elem,index,array) {
    totalLength += elem.length;  
  });

  buffer = new Buffer.concat(arrays, totalLength);
  wav = writeWavHeaders(totalLength,buffer);

  return fs.writeFileSync("test_heads.wav",wav);
}
