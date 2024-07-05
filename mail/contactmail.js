(function () {
  emailjs.init("t9Zu3VihU1mH4_MCc"); // Replace YOUR_USER_ID with your EmailJS user ID

  document
    .getElementById("contactForm")
    .addEventListener("submit", function (event) {
      event.preventDefault();

      var name = document.getElementById("name").value;
      var email = document.getElementById("email").value;
      var subject = document.getElementById("subject").value;
      var message = document.getElementById("message").value;

      var $this = document.getElementById("sendMessageButton");
      $this.disabled = true;

      emailjs
        .send("service_3tvvhsb", "template_4szqkya", {
          from_name: name,
          to_name: "Yash Prajapati", // Replace with recipient's name
          subject: subject,
          message: message,
          reply_to: email,
        })
        .then(
          function (response) {
            document.getElementById("success").innerHTML =
              "<div class='alert alert-success'>Your message has been sent.</div>";
            document.getElementById("contactForm").reset();
          },
          function (error) {
            console.error("FAILED...", error);
            document.getElementById("success").innerHTML =
              "<div class='alert alert-danger'>Sorry, an error occurred. Please try again later.</div>";
          }
        )
        .finally(function () {
          setTimeout(function () {
            $this.disabled = false;
          }, 1000);
        });
    });
})();
