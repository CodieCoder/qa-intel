Feature: User Authentication

@auth @smoke
Scenario: Successful login with valid credentials
  Given I navigate to "/login"
  When I type "test@example.com" into email_input
  And I type "password123" into password_input
  And I click login_button
  Then I should see dashboard_container
  And the url should contain "/dashboard"

@auth @negative
Scenario: Login fails with invalid credentials
  Given I navigate to "/login"
  When I type "wrong@example.com" into email_input
  And I type "wrongpassword" into password_input
  And I click login_button
  Then I should see error_message
  And error_message should contain text "Invalid"
  And I should not see dashboard_container
