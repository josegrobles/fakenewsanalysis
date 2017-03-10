var express = require('express');
let ArticleParser = require('article-parser');
let request = require('request')
let moment = require('moment')
let redis = require('redis')
let client = redis.createClient()
let URL = require('url').URL

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
    let urinfo = new URL(url)
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
    let urinfo = new URL(url)
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

})


router.post('/analysis', function(req, res, next) {
    let random = Math.random()
    res.end(JSON.stringify({
        accuracy: random
    }))
})
module.exports = router;
