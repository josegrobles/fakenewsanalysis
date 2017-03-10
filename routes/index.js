var express = require('express');
let ArticleParser = require('article-parser');
let request = require('request')
let moment = require('moment')
let redis = require('redis')
let cheerio = require('cheerio')
let client = redis.createClient(process.env.REDIS_URL)
let URL = require('url')

var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', {
        title: 'Express'
    });
});

router.post('/article', function(req, res, next) {
    let {
        url
    } = req.body
    let urinfo = URL.parse(url)
    client.hget(urinfo.hostname, urinfo.pathname, function(err, resp) {
        if (err) res.end("error")
        else {
            console.log(resp !== null)
            if (resp !== null) res.end(resp)
            else {
                ArticleParser.extract(url).then((article) => {
                    client.hset(urinfo.hostname, urinfo.pathname, JSON.stringify(article))
                    res.end(JSON.stringify(article));
                }).catch((err) => {
                    console.log(err)
                    res.end("error");
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
        if (err) res.end("error")
        else if (resp === null) res.end("send_again")
        else {
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
                            if (moment('2017-03-10T13:35:00').isSame(values[i].datePublished, 'day')) final.push(values[i])
                        }
                        res.end(JSON.stringify(final))
                    }
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
    if (err) res.end("error")
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


router.post('/analysis', function(req, res, next) {
    let random = Math.random()
    res.end(JSON.stringify({
        accuracy: random
    }))
})
module.exports = router;
