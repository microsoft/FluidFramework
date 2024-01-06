document.addEventListener('DOMContentLoaded', function() {
    
  const carousels = document.querySelectorAll('.carousel');
  carousels.forEach(function( carousel ) {

      const ele = carousel.querySelector('ul');
      const amountvisible = Math.round(ele.offsetWidth/ele.querySelector('li:nth-child(1)').offsetWidth);
      const bullets = carousel.querySelectorAll('ol li');
      const slides = carousel.querySelectorAll('ul li');
      const nextarrow = carousel.querySelector('.next');
      const prevarrow = carousel.querySelector('.prev');

      // Initialize the carousel
      nextarrow.style.display = 'block';
      prevarrow.style.display = 'block';
      ele.scrollLeft = 0;
      bullets[0].classList.add('selected');
      slides[0].classList.add('selected');
      if(amountvisible>1) {
        var removeels = carousel.querySelectorAll('ol li:nth-last-child(-n + '+(amountvisible-1)+')');
        removeels.forEach(function(removeel) {
          removeel.remove();
        });
      }

      const setSelected = function() {
          bullets.forEach(function(bullet) {
             bullet.classList.remove('selected');
          });
          slides.forEach(function(slide) {
             slide.classList.remove('selected');
          });
          const scrolllength = carousel.querySelector('ul li:nth-child(2)').offsetLeft - carousel.querySelector('ul li:nth-child(1)').offsetLeft;
          const nthchild = (Math.round((ele.scrollLeft/scrolllength)+1));
          carousel.querySelector('ol li:nth-child('+nthchild+')').classList.add('selected'); 
          carousel.querySelector('ul li:nth-child('+nthchild+')').classList.add('selected'); 
          if(carousel.parentElement.parentElement.querySelector('.dynamictitle')) {
              const title = carousel.querySelector('ul li:nth-child('+nthchild+') img').getAttribute('title'); 
              if(title) carousel.parentElement.parentElement.querySelector('.dynamictitle').innerHTML = title;
          }
      }

      const scrollTo = function(event) {
          event.preventDefault();
          ele.scrollLeft = ele.querySelector(this.getAttribute('href')).offsetLeft;
      }
      
      const nextSlide = function() {
          if(!carousel.querySelector('ol li:last-child').classList.contains('selected')) {
              carousel.querySelector('ol li.selected').nextElementSibling.querySelector('a').click();
          } else {
              carousel.querySelector('ol li:first-child a').click();
          }
      }

      const prevSlide = function() {
          if(!carousel.querySelector('ol li:first-child').classList.contains('selected')) {
              carousel.querySelector('ol li.selected').previousElementSibling.querySelector('a').click();
          } else {
              carousel.querySelector('ol li:last-child a').click();
          }
      }
      
      const setInteracted = function() {
        ele.classList.add('interacted');
      }
          
      // Attach the handlers
      ele.addEventListener("scroll", debounce(setSelected));
      ele.addEventListener("touchstart", setInteracted);
      ele.addEventListener('keydown', function (e){
          if(e.key == 'ArrowLeft') ele.classList.add('interacted');
          if(e.key == 'ArrowRight') ele.classList.add('interacted');
      });

      nextarrow.addEventListener("click", nextSlide);
      nextarrow.addEventListener("mousedown", setInteracted);
      nextarrow.addEventListener("touchstart", setInteracted);

      prevarrow.addEventListener("click", prevSlide);
      prevarrow.addEventListener("mousedown", setInteracted);
      prevarrow.addEventListener("touchstart", setInteracted);

      bullets.forEach(function(bullet) {
        bullet.querySelector('a').addEventListener('click', scrollTo);
        bullet.addEventListener("mousedown", setInteracted);
        bullet.addEventListener("touchstart", setInteracted);
      });

      //setInterval for autoplay
      if(carousel.getAttribute('duration')) {
        setInterval(function(){ 
          if (ele != document.querySelector(".carousel:hover ul") && ele.classList.contains('interacted')==false) {
            nextarrow.click();
          }
        }, carousel.getAttribute('duration'));
      }
    
    
  }); //end foreach

}); //end onload


/**
* Debounce functions for better performance
* (c) 2021 Chris Ferdinandi, MIT License, https://gomakethings.com
* @param  {Function} fn The function to debounce
*/
function debounce (fn) {
// Setup a timer
let timeout;
// Return a function to run debounced
return function () {
  // Setup the arguments
  let context = this;
  let args = arguments;
  // If there's a timer, cancel it
  if (timeout) {
    window.cancelAnimationFrame(timeout);
  }
  // Setup the new requestAnimationFrame()
  timeout = window.requestAnimationFrame(function () {
    fn.apply(context, args);
  });
};
}
