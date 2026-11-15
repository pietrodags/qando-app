@smoke
Feature: The service is up
  As the owner, I want one command that checks a running version,
  so that I know the web, the API and the database work together after a deploy.

  Scenario: The web reaches the API and the database
    When I ask the web how the service is
    Then it answers that the API and the database are up

  Scenario: The home page opens the creation wizard
    When I open the home page
    Then I am on step 1

  Scenario: An unknown address shows the not-found page
    When I open "/no-existe"
    Then I see the heading "Página no encontrada"
    And the tab title is "Página no encontrada | qando"
