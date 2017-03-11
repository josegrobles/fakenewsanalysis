var express = require('express');
let ArticleParser = require('article-parser');
let request = require('request')
let moment = require('moment')
let redis = require('redis')
let cheerio = require('cheerio')
let client = redis.createClient(process.env.REDIS_URL)
let URL = require('url')
var Twit = require('twit')
var T = new Twit({
    consumer_key:         process.env.CONSUMER_KEY,
    consumer_secret:      process.env.CONSUMER_SECRET,
    access_token:         process.env.ACCESS_TOKEN,
    access_token_secret:  process.env.ACCESS_TOKEN_SECRET
})
var router = express.Router();

var goodSites = []
var biasedSites = []
var satiricSites = []

client.sadd("goodSites","elpais")
client.sadd("goodSites","elmundo")
client.sadd("goodSites","publico")
client.sadd("goodSites","abc")
client.sadd("goodSites","larazon")
client.sadd("biased","okdiario")
client.sadd("biased","periodistadigital")
client.sadd("biased","diariodigital")
client.sadd("biased","gaceta")
client.sadd("satiric","elmundotoday")
client.sadd("satiric","libremercado")


client.smembers("goodSites",function(err,reply){
  goodSites = reply
})
client.smembers("biased",function(err,reply){
  biasedSites = reply
})
client.smembers("satiric",function(err,reply){
  satiricSites = reply
})

/* GET home page. */
router.get('/', function(req, res, next) {
  res.sendfile('views/index.html');
});

router.post('/article', function(req, res, next) {
    let {
        url
    } = req.body
    let urinfo = URL.parse(url)
    client.hget(urinfo.hostname, urinfo.pathname, function(err, resp) {
        if (err) res.end(JSON.stringify({status:"error"}))
        else {
            if (resp !== null) res.end(resp)
            else {
                ArticleParser.extract(url).then((article) => {
                    client.hset(urinfo.hostname, urinfo.pathname, JSON.stringify(article))
                    res.end(JSON.stringify(article));
                }).catch((err) => {
                    console.log(err)
                    res.end(JSON.stringify({status:"error"}))
                });
            }
        }
    })


})

router.post('/related', function(req, res, next) {
    let {
        url
    } = req.body
    let urinfo = URL.parse(url)
    client.hget(urinfo.hostname, urinfo.pathname, function(err, resp) {
        if (err) res.end(JSON.stringify({status:"error"}))
        else if (resp === null) res.end(JSON.stringify({status:"send_again"}))
        else {
          client.get(urinfo.pathname,function(err,r){
            if (err) res.end(JSON.stringify({status:"error"}))
            else if (resp !== null) res.end(r)
            else{
              let info = JSON.parse(resp)
              var options = {
                  url: "https://api.cognitive.microsoft.com/bing/v5.0/news/search?q=" + info.title + "&count=10&offset=0&mkt=es-es&safeSearch=Moderate",
                  headers: {
                      'Ocp-Apim-Subscription-Key': process.env.OCP1
                  }
              };

              request(options, function(error, response, body) {
                  if (!error && response.statusCode == 200) {
                      var info = JSON.parse(body);
                      if (resp.publishedTime === "") res.end(JSON.stringify(info.value))
                      else {
                          let values = info.value
                          let final = []
                          for (var i = 0; i < values.length; i++) {
                              if (moment(resp.publishedTime).isSame(values[i].datePublished, 'day')) final.push(values[i])
                          }
                          client.set(urinfo.pathname,JSON.stringify(final),1800)
                          res.end(JSON.stringify(final))
                      }
                  }
              })

            }
          })

        }
    })
})

router.post('/languageAnalysis',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hget(urinfo.hostname+":sentiments", urinfo.pathname, function(err, resp) {
    if (err) res.end(JSON.stringify({status:"error"}))
    else if (resp !== null) res.end(resp)
    else{
      client.hget(urinfo.hostname, urinfo.pathname, function(err, resp) {
        let parse = JSON.parse(resp)
        const $ = cheerio.load(parse.content)
        let object = {documents:[]}
        var index = 0
        $('p').each(function(i,elem){
          let texto = $(this).text().split(".")
          for (var x=0;x<texto.length;x++){
            if(texto[x] !== " " && texto[x] !== "") {
              object.documents.push({language:"es",id:index,text:texto[x]})
              index++
            }
          }
        })
        request.post("https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/sentiment",{body:JSON.stringify(object),headers: {'Ocp-Apim-Subscription-Key': process.env.OCP2}},function(error,response,body){
          let final = {sentiments:[]}
          const parsed = JSON.parse(body)
          for(var i=0;i < parsed.documents.length ; i++){
            final.sentiments.push({score:parsed.documents[i].score,text:object.documents[parsed.documents[i].id].text})
          }
          client.hset(urinfo.hostname+":sentiments", urinfo.pathname,JSON.stringify(final))
          res.end(JSON.stringify(final))
        })
      })

    }
})

})

router.post('/keyPhrases',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hget(urinfo.hostname+":keyPhrases", urinfo.pathname, function(err, resp) {
    if (err) res.end(JSON.stringify({status:"error"}))
    else if (resp !== null) res.end(resp)
    else{
      client.hget(urinfo.hostname, urinfo.pathname, function(err, resp) {
        let parse = JSON.parse(resp)
        const $ = cheerio.load(parse.content)
        let object = {documents:[]}
        var index = 0
        let text = $('p').text()
        object.documents.push({id:0,})
        request.post("https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/keyPhrases",{body:JSON.stringify(object),headers: {'Ocp-Apim-Subscription-Key': process.env.OCP2}},function(error,response,body){
          let final = {sentiments:[]}
          const parsed = JSON.parse(body)
          for(var i=0;i < parsed.documents.length ; i++){
            final.sentiments.push({score:parsed.documents[i].keyPhrases,text:object.documents[parsed.documents[i].id].text})
          }
          client.hset(urinfo.hostname+":keyPhrases", urinfo.pathname,JSON.stringify(final))
          res.end(JSON.stringify(final))
        })
      })

    }
})

})

router.post('/like',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hincrby(urinfo.hostname+":likes", urinfo.pathname,1)
  client.incr(urinfo.hostname+":likesG")
  res.end(JSON.stringify({status:"ok"}))
})
router.post('/getlikes',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hget(urinfo.hostname+":likes", urinfo.pathname,function(err,result){
    if(err) res.end(JSON.stringify({status:"error"}))
    else if(result === null) res.end(JSON.stringify({likes:0}))
    else res.end(JSON.stringify({likes:result}))
  })
})
router.post('/dislike',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hincrby(urinfo.hostname+":dislikes", urinfo.pathname,1)
  client.incr(urinfo.hostname+":dislikesG")
  res.end(JSON.stringify({status:"ok"}))
})
router.post('/getdislikes',function(req,res,next){
  let {
      url
  } = req.body
  let urinfo = URL.parse(url)
  client.hget(urinfo.hostname+":dislikes", urinfo.pathname,function(err,result){
    if(err)   res.end(JSON.stringify({status:"error"}))
    else if(result === null) res.end(JSON.stringify({dislikes:0}))
    else res.end(JSON.stringify({dislikes:result}))
  })
})
let facebook = function(url) {
        return new Promise((resolve,reject) => {
        var apiUrl = "https://graph.facebook.com/" + encodeURIComponent(url);

        request.get({
            url: apiUrl,
            json: true
        }, function(err, res, body) {
            if (err) {
                return callback(err);
            }

            if (!body || !body.share || typeof body.share.comment_count !== "number" || typeof body.share.share_count !== "number") {
                reject(new Error("No well-formed body in response."));
            }else{
              resolve({comment_count:body.share.comment_count ? body.share.comment_count : 0 ,share_count:body.share.share_count ? body.share.share_count : 0})
            }

            // The "total count" will be the "comment count" plus the "share count."

        });
      })
    }

router.post('/fb', function(req,res,next){
  let {
      url
  } = req.body
  facebook(url).then(r =>{
    res.end(JSON.stringify(r))
  }).catch(e =>{
    res.end(JSON.stringify({status:"error"}))
  })

})


router.post('/twitter',function(req,res,next){
  let {
      url
  } = req.body
let x = []
let searchTweet = (url,since_id) => {
    T.get('search/tweets',{q:url,count:100,since_id},function(err,data,response){
      for(var i = 0; i < data.statuses.length;i++) x.push(data.statuses[i])
      if (data.statuses.length === 100) searchTweet(url,data.search_metadata.max_id_str)
      else res.end(JSON.stringify({tweets:x.length}))
    })
}
searchTweet(url,0)
})

router.post('/addcoment',function(req,res,next){
  let {
      url,comment
  } = req.body
  let urinfo = URL.parse(url)
  client.hset(urinfo.hostname+":dislikes", urinfo.pathname,comment)
  res.end(JSON.stringify({status:"ok"}))
})

router.post('/analysis', function(req, res, next) {
  //quality function [0-1] (the greater the better) = if in GoodSites = 0.5 else if not fake 0.2, fake 0. sentiment analysis [0-1] * 0.1 + if article in other goodSites [0-1] * 0.15 + avg likes/dislikes * 0.2 + follows standard? [0-1] * 0.05 + Title caps [0-1] * -0.1
  //todo check agains polifacts...
  //add site likes avg
  let {
      url,comment
  } = req.body
  let urinfo = URL.parse(url)
  let reliability = getKindOf(urinfo.hostname)
  var accuracy = 0
  getLoveAvgArticle(urinfo).then(r =>{
    accuracy = reliability + (r*0.15)
    console.log(r,accuracy)
    return getLoveAvgGlobal(urinfo)
  }).then(r => {
    accuracy += (r*0.05)
    console.log(r,accuracy)
    return getUppercase(urinfo)
  }).then(r => {
    accuracy -= r*0.1
    return getSentiments(urinfo)
    console.log(r,accuracy)
  }).then(r => {
    if (r > 0.5) accuracy += 0.1
    else accuracy -= 0.5
    res.end(JSON.stringify({accuracy}))
  }).catch(err => {
    console.log(err)
    res.end(JSON.stringify({status:"error"}))
  })
})

getKindOf = (hostname) => {
  for(var i = 0  ; i < goodSites.length ; i++){
    if(hostname.includes(goodSites[i])) return 0.5
  }
  for(var i = 0  ; i < biasedSites.length ; i++){
  if(hostname.includes(biasedSites[i])) return 0.2
}
for(var i = 0  ; i < satiricSites.length ; i++){
  if(hostname.includes(satiricSites[i])) return 0.2
  }
  return 0
}

getLoveAvgArticle = (url) => {
  var dislikes = 0
  var likes = 0
  return new Promise((resolve,reject) => {
    client.hget(url.hostname+":dislikes", url.pathname,function(err,result){
      if (err) reject(err)
      else if(result !== null) dislikes = result
      client.hget(url.hostname+":likes", url.pathname,function(err,result){
        if (err) reject(err)
        else if(result !== null) likes = result
        if(likes+dislikes === 0) resolve(0)
        else{
          const avg = likes / (likes+dislikes)
          resolve(avg)
        }
      })
    })
  })
}
getLoveAvgGlobal = (url) => {
  var dislikes = 0
  var likes = 0
  return new Promise((resolve,reject) => {
    client.get(url.hostname+":dislikesG",function(err,result){
      if (err) reject(err)
      else if(result !== null) dislikes = result
      client.get(url.hostname+":likesG",function(err,result){
        if (err) reject(err)
        else if(result !== null) likes = result
        if(likes+dislikes === 0) resolve(0)
        else{
          const avg = likes / (likes+dislikes)
          resolve(avg)
        }
      })
    })
  })
}

getUppercase = (url) => {
  return new Promise((resolve,reject) => {
    client.hget(url.hostname, url.pathname, function(err, resp) {
    if (err) reject(err)
    else if(resp === null) resolve(0)
    else{
        let parser = JSON.parse(resp)
        let arrayText = parser.title.split("")
        var total = 0
        for(var i = 0; i < arrayText ; i++){
          if(arrayText[i] > 'A' && arrayText < 'Z') total++
        }
        let avg = total / arrayText.length
        resolve(avg)
    }
  })
})
}

getSentiments = (url) => {
  return new Promise((resolve,reject) => {
    client.hget(url.hostname+":sentiments", url.pathname, function(err, resp) {
      if(err) reject(err)
      else if (resp === null) resolve(0)
      else{
        let negative = 0
        let parser = JSON.parse(resp)
        for(var i = 0 ;i < parser.sentiments.length; i++){
          if(parser.sentiments[i].score < 0.8) negative++
        }
        const total = negative / parser.sentiments.length
        resolve(total)
      }
  })
}

getRelatedNewsOnGoodMedia = (url) => {
  
}
module.exports = router;
