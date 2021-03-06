var connect = require('connect')
  , fs = require('fs')
  , keys = {
      'consumer_key': process.env.consumer_key
    , 'consumer_secret' : process.env.consumer_secret
    , 'access_token_key' : process.env.access_token_key
    , 'access_token_secret': process.env.access_token_secret
  }
  , tu = require('tuiter')(keys)
  , async = require('async')
  , _ = require('underscore')
  , moment = require('moment')
  , samples = []
  , lastSample = []
  , dirSamples = __dirname + '/samples/'
  , interval = 5 * 60 * 1000
  , timeline = 309528017 // @npmjs

  
/*****************************************************************************/

fs.readdir(dirSamples, function (err, list) {
  if (err) throw new Error('Cannot read samples folder')
  list.forEach(function (name) {
    samples.push(require(dirSamples + name))
  })
})

var db = require('./db')(check)

function check(err, collection) {
  if (err) throw new Error('Error reading database')

  lastSample = []
  samples.forEach(function (fn) {
    fn({}, saveData)
  })

  setTimeout(function () {
    check(err, collection)
  }, interval)
}

function saveData(sample) {
  db.collection('status', function (err, collection) {
    collection.insert(sample, function(err, docs) {
      if (err) throw err
    })
  })

  lastSample.push(sample)
  io.sockets.emit('update', sample)
}

/****************************************************************************/

var app = connect()
    .use(connect.static(__dirname + '/public'))
    .listen(process.env.PORT || 80)
  , io = require('socket.io').listen(app)

io.set('log level', 1)

io.sockets.on('connection', function (socket) {
  lastSample.forEach(function (sample){
    socket.emit('update', sample)
  })

  socket.emit('twit', twits)  
})

var twits = []
twits.push = function (twit) {
  Array.prototype.push.call(this, twit)
  io.sockets.emit('twit', twit)
}

var parseTweet = function(text){
  // Parse URIs
  text = text.replace(/((([A-Za-z]{3,9}:(?:\/\/)?)(?:[-;:&=\+\$,\w]+@)?[A-Za-z0-9.-]+|(?:www.|[-;:&=\+\$,\w]+@)[A-Za-z0-9.-]+)((?:\/[\+~%\/.\w-_]*)?\??(?:[-\+=&;%@.\w_]*)#?(?:[\w]*))?)/, function(uri){
    var link = '<a href="'+uri+'" target="_blank">'+uri+'</a>'
    var len = uri.length
    var lastChar = uri.substring(len-1, len);
    if(lastChar == '.'){
      uri = uri.substring(0, len-1)
      link = '<a href="'+uri+'" target="_blank">'+uri+'</a>.'
    }
    
    return link
  });
  
  // Parse Twitter usernames
  text = text.replace(/[@]+[A-Za-z0-9-_]+/g, function(u){
    var username = u.replace("@", "")
    return '<a href="http://twitter.com/' + username + '" target="_blank">'+u+'</a>'
  })
  
  // Parse Twitter hash tags
  text = text.replace(/[#]+[A-Za-z0-9-_]+/g, function(t){
    var tag = t.replace("#", "%23")
    return '<a href="http://twitter.com/search?q=' + tag + '" target="_blank">'+t+'</a>'
  })

  return text;
};

var extractTweet = function (tweet) {
  return {
      screen_name: tweet.user.screen_name
    , id: tweet.id 
    , text: parseTweet(tweet.text)
    , profile_image_url: tweet.user.profile_image_url
    , created_at: tweet.created_at
  }
}

// Get the last 20 twits
function getTwits () {
  console.log('refreshing tweets');
  twits = []
  async.series([
    function(cb){
      tu.userTimeline({screen_name: ['npmjs']}, function (er, res) {
        if (er) console.log(er)
        res.forEach(function (tweet) {
          twits.unshift(extractTweet(tweet))
        });
       cb();
      });
    },
    function(cb){
      tu.userTimeline({screen_name: ['iriscouch']}, function (er, res) {
        if (er) console.log(er)
        res.forEach(function (tweet) {
          twits.unshift(extractTweet(tweet))
        });
        cb();
      });
    }
  ], function(){
    //done
    // sort tweets by creation time
    // console.log('DONE')
    twits = _.sortBy(twits, function(obj){ return moment(obj.created_at).unix(); });
    // console.log(twits)
    io.sockets.emit('twit', twits) 
  })
}

// refresh twits every 5 minutes
setInterval(getTwits, 5 * 60 * 1000);
getTwits()

// Connect a stream for incomming tweets 
// tu.filter({follow: [timeline]}, function (stream) {
//   stream.on('tweet', function (tweet) {
//     console.log('TWEET TWEEET')
//     if(!tweet.user) return console.log(tweet)
//     if(tweet.user.id === timeline) 
//       twits.push(extractTweet(tweet))
//   })

//   stream.on('error', function (err) {
//     console.log('Error on tweeter stream: ', err, arguments)
//   })
// })
