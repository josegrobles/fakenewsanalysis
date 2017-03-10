var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});
router.post('/analysis',function(req,res,next){
  let random = Math.random()
  res.end(JSON.stringify({accuracy: random}))
})
module.exports = router;
