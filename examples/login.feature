Feature: User Authentication

@auth @smoke
Scenario: Successful login with valid credentials
  Given I navigate to "/login"
  When I type "test@example.com" into the field "Email"
  And I type "password123" into the field "Password"
  And I click the button "Login"
  Then I should see the heading "Welcome to Dashboard"
  And the url should contain "/dashboard"

@auth @negative
Scenario: Login fails with invalid credentials
  Given I navigate to "/login"
  When I type "wrong@example.com" into the field "Email"
  And I type "wrongpassword" into the field "Password"
  And I click the button "Login"
  Then I should see the alert "Invalid email or password"
  And the alert "Invalid email or password" should contain text "Invalid"
  And I should not see the heading "Welcome to Dashboard"
