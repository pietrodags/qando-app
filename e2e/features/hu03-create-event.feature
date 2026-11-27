@HU03
Feature: Create an event with date and time options
  As an organizer, I want to create an event with date and time options,
  without filling a sign-up form, so that my group can tell me when they can meet.

  Background:
    Given today is "2026-06-15" in "Europe/Madrid"

  Scenario: An event with dates only is created and gets its links
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the dates "2026-07-06" and "2026-07-10"
    Then I see the "¡Hecho!" step with the participation link
    And the participation link shows the options:
      | option         |
      | lun 6 jul      |
      | vie 10 jul     |
    And the event has a management link and a results link, both different from the participation link

  Scenario: Each time is one option and a date without times is a whole day
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Cena de verano" with the options:
      | dates      | time        |
      | 2026-07-06 | 18:15       |
      | 2026-07-06 | 20:00-22:00 |
      | 2026-07-10 |             |
    Then participants vote on exactly these 3 options, in this order:
      | option                  |
      | lun 6 jul, 18:15        |
      | lun 6 jul, 20:00–22:00  |
      | vie 10 jul, sin horario |

  Scenario: Overlapping options are kept apart
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I create the event "Viaje" with the options:
      | dates                 |
      | 2026-07-06..2026-07-09 |
      | 2026-07-08            |
    Then participants vote on 2 options

  Scenario: The summary lists every option as it will be voted, a column for each date
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    Then I am on step 3, on its summary
    And the summary on screen is:
      | column     | options            |
      | 2026-07-06 | 18:15, 20:00–22:00 |
      | 2026-07-10 | Sin horario        |

  Scenario: A date and a range from the same day: the date's column goes first, as on the times step
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-25"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I press the day "2026-06-22"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the time "18:00" of "2026-06-22"
    And I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary
    And the summary on screen is:
      | column                 | options     |
      | 2026-06-22             | 18:00       |
      | 2026-06-22..2026-06-25 | Sin horario |

  Scenario: The summary opens in the times' card, on the columns the times showed, and its arrows move them back to the times
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 6 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the time "9:00" of "2026-06-21"
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary
    And the summary on screen is:
      | column     | options     |
      | 2026-06-22 | Sin horario |
      | 2026-06-23 | Sin horario |
      | 2026-06-24 | Sin horario |
      | 2026-06-25 | Sin horario |
    And the place among the columns reads "3 / 3"
    When I press the step's arrow "Día anterior"
    And I press the step's arrow "Día anterior"
    Then the summary on screen is:
      | column     | options     |
      | 2026-06-20 | Sin horario |
      | 2026-06-21 | 9:00        |
      | 2026-06-22 | Sin horario |
      | 2026-06-23 | Sin horario |
    When I press the step's arrow "Volver a los horarios"
    Then I am on step 3, on its times
    And the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |

  Scenario: From the summary's last columns on to the last step, after step 3, and back to the summary as it was left
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 6 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary
    When I press the step's arrow "Siguiente"
    Then I am on the last step
    When I press the step's arrow "Volver al paso 3"
    Then I am on step 3, on its summary
    And the place among the columns reads "3 / 3"

  Scenario: A column of the summary is corrected in place, open on its first time, and its check closes it with what was corrected
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    Then I see "Haz clic sobre la columna que quieras corregir."
    When I press the summary's column of "2026-07-06"
    Then I am on step 3, on its summary
    And only the summary's column of "2026-07-06" is open
    And the times marked on "2026-07-06" are "18:15, 20:00 → 22:00"
    And the time "18:15" of "2026-07-06" is in sight
    And I see "Haz clic sobre la columna que quieras corregir."
    When I press the time "18:15" of "2026-07-06"
    And I press the check of "2026-07-06"
    Then no column of the summary is open
    And the summary on screen is:
      | column     | options     |
      | 2026-07-06 | 20:00–22:00 |
      | 2026-07-10 | Sin horario |
    When I press the step's arrow "Volver a los horarios"
    Then I am on step 3, on its times
    And the time "20:00" of "2026-07-06" is in sight

  Scenario: Another column of the summary opens instead, and a press outside or Escape closes the open one with what was corrected
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    And I press the summary's column of "2026-07-06"
    And I press the summary's column of "2026-07-10"
    Then only the summary's column of "2026-07-10" is open
    When I press the time "9:00" of "2026-07-10"
    And I press the summary's label
    Then no column of the summary is open
    And the summary on screen is:
      | column     | options            |
      | 2026-07-06 | 18:15, 20:00–22:00 |
      | 2026-07-10 | 9:00               |
    When I press the summary's column of "2026-07-10"
    And I press the time "11:00" of "2026-07-10"
    And I press the key "Escape"
    Then no column of the summary is open
    And the summary on screen is:
      | column     | options            |
      | 2026-07-06 | 18:15, 20:00–22:00 |
      | 2026-07-10 | 9:00, 11:00        |

  Scenario: The summary's arrows close the open column and move the columns
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 6 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Día siguiente"
    And I press the step's arrow "Siguiente"
    And I press the summary's column of "2026-06-23"
    Then only the summary's column of "2026-06-23" is open
    When I press the step's arrow "Día anterior"
    Then no column of the summary is open
    And the place among the columns reads "2 / 3"

  Scenario: With the mouse over a column of a date, "Editar" shows; a range of days shows nothing and does not open
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-25"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I press the day "2026-06-22"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary
    And the summary's column of "2026-06-22" does not show "Editar"
    When I move the mouse over the summary's column of "2026-06-22"
    Then the summary's column of "2026-06-22" shows "Editar"
    When I move the mouse over the summary's column of "2026-06-22..2026-06-25"
    Then the summary's column of "2026-06-22" does not show "Editar"
    And the summary's column of "2026-06-22..2026-06-25" has no "Editar"
    When I press the summary's column of "2026-06-22..2026-06-25"
    Then no column of the summary is open

  Scenario: A column of the summary is opened with the keyboard, and once closed the focus is back on its "Editar"
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    And I reach the "Editar" of the summary's column of "2026-07-06" with the Tab key
    Then the summary's column of "2026-07-06" shows "Editar"
    When I press the key "Enter"
    Then only the summary's column of "2026-07-06" is open
    When I press the key "Escape"
    Then no column of the summary is open
    And the focus is on the "Editar" of the summary's column of "2026-07-06"
    When I press the key "Enter"
    And I press the check of "2026-07-06"
    Then no column of the summary is open
    And the focus is on the "Editar" of the summary's column of "2026-07-06"

  @touch
  Scenario: With a finger, a column of the summary is tapped, a time is saved with the "+" button, and the check closes it
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    Then I see "Toca la columna que quieras corregir."
    When I press the summary's column of "2026-07-10"
    Then only the summary's column of "2026-07-10" is open
    When I press the time "9:00" of "2026-07-10"
    And I press the button "Guardar una hora" of the times step
    And I save the time "9:00" of "2026-07-10" with its "+"
    Then the saved times of "2026-07-10" are "9:00"
    When I press the check of "2026-07-10"
    Then no column of the summary is open
    And the summary on screen is:
      | column     | options            |
      | 2026-07-06 | 18:15, 20:00–22:00 |
      | 2026-07-10 | 9:00               |

  Scenario: The event survives an API restart
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have created the event "Cena de verano"
    When the API restarts
    Then the participation link still shows "Cena de verano" with its options

  Scenario: Step 1 asks only the title, and "Siguiente" stays disabled until it is written
    When I open the creation wizard
    Then step 1 has one field, "¿Qué organizamos?"
    And "Siguiente" is disabled
    And screen readers hear with "Siguiente": "Completa el título del evento."
    When I type the title "Cena de verano"
    Then "Siguiente" is enabled
    And no field is marked as valid

  Scenario: Enter goes to the dates step once the title is written
    Given I have opened the creation wizard
    When I press Enter in the title field
    Then I am still on step 1
    When I type the title "Cena de verano" and press Enter
    Then I am on step 2

  Scenario: On a wide screen, step 1 opens with the cursor in the title field
    Given the screen measures 1280 by 800
    When I open the creation wizard
    Then the cursor is in the title field

  Scenario: The name field of the last step starts with the organizer name of my last event
    Given I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana" and then the event "Cena" as "Ana G."
    When I go on to the last step with the title "Cena de verano" and the date "2026-07-06"
    Then the name field holds "Ana G."
    And no field is marked as valid

  Scenario: Without an event of mine, the name field of the last step starts empty
    Given I am signed in as "ana@example.com" with the name "Ana"
    When I go on to the last step with the title "Cena de verano" and the date "2026-07-06"
    Then the name field holds ""

  Scenario: A name typed in the wizard is kept over the name of my last event
    Given I am signed in as "ana@example.com"
    And I created the event "Cena" as "Ana G."
    And I have gone on to the last step with the name "Ana G." proposed
    When I type my name "Anita"
    And I reload the page
    Then the name field holds "Anita"

  Scenario: Signing out forgets the name of my last event left as it was, and the last step asks it again
    Given the screen measures 1280 by 800
    And I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana G."
    And I have gone on to the last step with the name "Ana G." proposed
    When I press "Cerrar sesión" under my email
    Then I am on the last step
    And the name field holds ""
    And the cursor is in the name field

  Scenario: Signing out keeps a name I typed, and the cursor waits in the email field
    Given the screen measures 1280 by 800
    And I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana G."
    And I have gone on to the last step with the name "Ana G." proposed
    And I have typed my name "Anita"
    When I press "Cerrar sesión" under my email
    Then the name field holds "Anita"
    And the cursor is in the email field

  Scenario: Another account signed in where my name was proposed gets the name of its own last event
    Given I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana G."
    And I have gone on to the last step with the name "Ana G." proposed
    And I am signed in as "bea@example.com"
    And I created the event "Paseo" as "Bea R."
    When I open the creation wizard
    Then I am on the last step
    And the name field holds "Bea R."

  Scenario: A reload while qando cannot say who is signed in keeps the name of my last event
    Given I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana G."
    And I have gone on to the last step with the name "Ana G." proposed
    When I reload the page while qando cannot say who is signed in
    Then I am on the last step
    And the name field holds "Ana G."

  Scenario: "Crear otro evento" proposes the name of the event just created
    Given I am signed in as "ana@example.com"
    And I created the event "Comida" as "Ana G."
    And I have created the event "Cena de verano" in the wizard as "Ana"
    When I press "Crear otro evento"
    Then I am on step 1
    And the title field holds ""
    When I go on to the last step with the title "Paseo" and the date "2026-07-06"
    Then the name field holds "Ana"

  Scenario: "Crear" without a name puts the cursor in the name field and says what is missing
    Given I have gone on to the last step with the title "Cena de verano" and the date "2026-07-06"
    And I have typed the email "ana@example.com"
    When I press "Crear"
    Then the name field says "Escribe tu nombre."
    And the cursor is in the name field
    And no sign-in code was sent
    When I type my name "A"
    Then the name field says nothing
    When I press "Crear"
    Then the name field says "Tu nombre necesita al menos 2 letras."

  Scenario: The comment is folded until it is asked for, and unfolds with its three rows
    Given I have gone on to the last step with the title "Cena de verano" and the date "2026-07-06"
    Then the comment box is folded
    When I press "Añade un comentario, si quieres."
    Then the comment box is unfolded, three rows tall
    And the cursor is in the comment box
    When I press "Añade un comentario, si quieres."
    Then the comment box is folded

  Scenario: Days are marked and removed one by one on the calendar
    Given I am on the dates step of the creation wizard
    Then the calendar shows "Junio 2026"
    And "Siguiente" is disabled
    And screen readers hear with "Siguiente": "Selecciona al menos una fecha."
    When I press the day "2026-06-20"
    And I press the day "2026-06-21"
    Then the marked days are:
      | day        |
      | 2026-06-20 |
      | 2026-06-21 |
    And "Siguiente" is enabled
    When I press the day "2026-06-20"
    Then the marked days are:
      | day        |
      | 2026-06-21 |

  Scenario: The calendar goes from today to twelve months ahead
    Given I am on the dates step of the creation wizard
    Then the day "2026-06-14" cannot be chosen
    And the calendar cannot go to the previous month
    When I go 12 months forward
    Then the calendar shows "Junio 2027"
    And the day "2027-06-15" can be chosen
    But the day "2027-06-16" cannot be chosen
    And the calendar cannot go to the next month

  Scenario: The dates and the month on screen are kept while visiting step 1
    Given I am on the dates step of the creation wizard
    When I go 1 month forward
    And I press the day "2026-07-06"
    And I go back to step 1 and on to the dates again
    Then the calendar shows "Julio 2026"
    And the marked days are:
      | day        |
      | 2026-07-06 |

  Scenario: The calendar is used with the keyboard alone
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    Then the focus is on the day "2026-06-15"
    When I press the key "ArrowDown" 3 times
    Then the calendar shows "Julio 2026"
    And the focus is on the day "2026-07-06"
    When I press the key "Enter" 1 time
    Then the marked days are:
      | day        |
      | 2026-07-06 |

  Scenario: A drag joins days into a range, and a second drag stops next to it
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-18" to the day "2026-06-20"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-18..2026-06-20 |
    And "Siguiente" is enabled
    When I drag from the day "2026-06-16" to the day "2026-06-19"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-16..2026-06-17 |
      | 2026-06-18..2026-06-20 |

  Scenario: A range is shortened from its end and removed with a click
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-18" to the day "2026-06-22"
    And I drag from the day "2026-06-22" to the day "2026-06-20"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-18..2026-06-20 |
    When I press the day "2026-06-19"
    Then no date is marked on the calendar
    And "Siguiente" is disabled

  Scenario: A range is made with the keyboard alone, across two months
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    Then a tip over the day "2026-06-29" reads "Elige el último día del rango."
    And screen readers hear under the calendar: "Elige el último día del rango."
    When I press the key "ArrowRight" 3 times
    Then the calendar shows "Julio 2026"
    And no tip is shown on the calendar
    And screen readers hear under the calendar: "Elige el último día del rango."
    When I press the key "Enter" 1 time
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-29..2026-07-02 |
    And screen readers hear nothing under the calendar

  Scenario: A day under the tip is pressed with the mouse as the last day of the range
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    Then a tip over the day "2026-06-29" reads "Elige el último día del rango."
    When I press the day "2026-06-22" where the tip covers it
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-22..2026-06-29 |
    And no tip is shown on the calendar

  Scenario: A range is saved with its "+" and waits under the calendar
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    Then no "+" is shown on the calendar
    When I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And "Siguiente" is enabled

  Scenario: A range that goes on into the next month is saved with the keyboard from its last day on screen
    Given I am on the dates step of the creation wizard
    When I reach the days of the calendar with the Tab key
    And I press the key "ArrowDown" 2 times
    And I press the key "Shift+Enter" 1 time
    And I press the key "ArrowRight" 3 times
    And I press the key "Enter" 1 time
    And I press the key "ArrowLeft" 2 times
    Then the calendar shows "Junio 2026"
    When I press the key "Tab" 1 time
    And I press the key "Enter" 1 time
    Then the saved ranges are:
      | range          |
      | Lun 29 ➔ Jue 2 |
    And no date is marked on the calendar
    And the focus is on the day "2026-06-30"

  Scenario: A range like a saved one is not marked again, and the saved one is shown
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And the saved range "Lun 22 ➔ Vie 26" is shown on the calendar
    And screen readers hear nothing under the calendar

  Scenario: A saved range is seen on the calendar from its pill and deleted with its "−"
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I press the saved range "Lun 22 ➔ Vie 26"
    Then the saved range "Lun 22 ➔ Vie 26" is shown on the calendar
    When I press the key "Escape" 1 time
    Then the saved range "Lun 22 ➔ Vie 26" is not shown on the calendar
    When I press the saved range "Lun 22 ➔ Vie 26"
    And I press the day "2026-06-10", which cannot be chosen
    Then the saved range "Lun 22 ➔ Vie 26" is not shown on the calendar
    When I delete the saved range "Lun 22 ➔ Vie 26"
    Then there are no saved ranges
    And "Siguiente" is disabled

  Scenario: The trash clears every date and saved range at once
    Given I am on the dates step of the creation wizard
    Then there is no trash under the calendar
    When I press the day "2026-06-20"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I drag from the day "2026-06-29" to the day "2026-06-30"
    And I press the trash
    And I answer the trash "Sí"
    Then no date is marked on the calendar
    And there are no saved ranges
    And there is no trash under the calendar
    And the calendar shows "Junio 2026"
    And "Siguiente" is disabled

  Scenario: The trash goes with the last saved range
    Given I am on the dates step of the creation wizard
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    And I move the mouse over the day "2026-06-24"
    And I save the range with its "+"
    And I delete the saved range "Lun 22 ➔ Vie 26"
    Then there is no trash under the calendar

  Scenario: The options are counted from 50 on and the 61st is not marked
    Given I am on the dates step of the creation wizard
    When I mark the 49 days from "2026-06-15"
    Then no options counter is shown
    When I press the day "2026-08-03"
    Then the options counter reads "50 de 60 opciones"
    And screen readers hear nothing under the calendar
    When I mark the 10 days from "2026-08-04"
    Then the options counter reads "60 de 60 opciones"
    And screen readers hear nothing under the calendar
    When I press the day "2026-08-14"
    Then the day "2026-08-14" is not marked
    And the options counter reads "60 de 60 opciones"
    When I press the day "2026-08-13"
    Then the options counter reads "59 de 60 opciones"
    And screen readers hear nothing under the calendar

  Scenario: The "Horario" switch is there only while a date of its own is marked
    Given I am on the dates step of the creation wizard
    Then there is no "Horario" switch
    When I drag from the day "2026-06-22" to the day "2026-06-26"
    Then there is no "Horario" switch
    When I press the day "2026-06-20"
    Then the "Horario" switch is off
    And the "Horario" switch is under the calendar, its right side over that of "Siguiente"
    When I turn the "Horario" switch on
    Then the "Horario" switch is on
    When I press the day "2026-06-20"
    Then there is no "Horario" switch
    When I press the day "2026-06-18"
    Then the "Horario" switch is on

  Scenario: The "Horario" switch is used with the keyboard and kept while visiting step 1
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I reach the "Horario" switch with the Tab key
    And I press the key "Space" 1 time
    Then the "Horario" switch is on
    When I go back to step 1 and on to the dates again
    Then the "Horario" switch is on

  @touch
  Scenario: With a finger, the "Horario" switch is between the two arrows
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    Then the "Horario" switch is between the two arrows, beside "Siguiente"
    When I turn the "Horario" switch on
    Then the "Horario" switch is on

  @touch
  Scenario: With a finger, a range is drawn, saved with the "+" button and deleted from its pill
    Given I am on the dates step of the creation wizard
    When I rest a finger on the day "2026-06-22" and slide it to the day "2026-06-26"
    Then the dates on the calendar are:
      | dates                  |
      | 2026-06-22..2026-06-26 |
    And no "+" is shown on the calendar
    When I press the button "Guardar un rango" under the calendar
    And I save the range with its "+"
    Then no date is marked on the calendar
    And the saved ranges are:
      | range           |
      | Lun 22 ➔ Vie 26 |
    And no "+" is shown on the calendar
    And the saved range "Lun 22 ➔ Vie 26" has no "−"
    When I press the saved range "Lun 22 ➔ Vie 26"
    And I delete the saved range "Lun 22 ➔ Vie 26" with the "−" on its pill
    Then there are no saved ranges

  @touch
  Scenario: With a finger, a ring closes on a day from outside the finger until the day is held
    Given I am on the dates step of the creation wizard
    Then a finger that rests on the day "2026-06-22" sees a ring close on it until the day is held
    And the dates on the calendar are:
      | dates      |
      | 2026-06-22 |

  @touch
  Scenario: With a finger, a slide sideways over the days changes the month
    Given I am on the dates step of the creation wizard
    # Nothing comes before the first month: a slide that way leaves it.
    When I slide a finger from the day "2026-06-23" to the day "2026-06-25"
    Then the calendar shows "Junio 2026"
    When I slide a finger from the day "2026-06-25" to the day "2026-06-23"
    Then the calendar shows "Julio 2026"
    When I slide a finger from the day "2026-07-21" to the day "2026-07-23"
    Then the calendar shows "Junio 2026"
    # A slide up or down moves the page, not the month, and marks nothing.
    When I slide a finger from the day "2026-06-17" to the day "2026-06-24"
    Then the calendar shows "Junio 2026"
    And no date is marked on the calendar
    # After a rest the slide draws a range, and the month stays.
    When I rest a finger on the day "2026-06-22" and slide it to the day "2026-06-24"
    Then the calendar shows "Junio 2026"
    And the dates on the calendar are:
      | dates                  |
      | 2026-06-22..2026-06-24 |

  Scenario Outline: The trash asks before it clears, <with>
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I press the trash
    Then the trash asks "¿Borrar todo?" in its place
    When I answer the trash "No"
    Then the trash is back under the calendar
    And the marked days are:
      | day        |
      | 2026-06-20 |
    When I press the trash
    And I answer the trash "Sí"
    Then no date is marked on the calendar
    And there is no trash under the calendar

    Examples:
      | with         |
      | with a mouse |

    @touch
    Examples:
      | with          |
      | with a finger |

  Scenario: The times step has a column for each date, in the order of the dates
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I press the day "2026-06-25"
    And I drag from the day "2026-06-22" to the day "2026-06-23"
    And I press the day "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then I am on step 3
    And the columns of times on screen are:
      | column                 |
      | 2026-06-20             |
      | 2026-06-22..2026-06-23 |
      | 2026-06-25             |
    And the column of "2026-06-22..2026-06-23" reads "Sin horario" and has no times
    And the column of "2026-06-20" shows the 9 hours from "9:00"
    And no time is marked on "2026-06-20"

  Scenario: The "︿" and "﹀" of a column move its hours one at each press, however quick
    Given the screen measures 1280 by 800
    And I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the "︿" of the column of "2026-06-20" 3 times in a row
    Then the column of "2026-06-20" shows the 9 hours from "6:00"
    And the column of "2026-06-21" shows the 9 hours from "9:00"
    When I press the "﹀" of the column of "2026-06-20" 5 times in a row
    Then the column of "2026-06-20" shows the 9 hours from "11:00"

  Scenario: A press marks a time on the hour and another press unmarks it
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I press the time "9:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "9:00, 18:00"
    And no time is marked on "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "9:00"

  Scenario: The arrows of a marked time move it by quarters, from :00 to :45
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "10:00" of "2026-06-20"
    Then the time "10:00" of "2026-06-20" cannot be moved earlier
    When I move the time "10:00" of "2026-06-20" 3 quarters later
    Then the times marked on "2026-06-20" are "10:45"
    And the time "10:45" of "2026-06-20" cannot be moved later
    When I move the time "10:45" of "2026-06-20" 2 quarters earlier
    Then the times marked on "2026-06-20" are "10:15"
    When I press the time "10:15" of "2026-06-20"
    Then no time is marked on "2026-06-20"

  Scenario: A drag over the hours makes a time range, and a press on any of its hours removes it
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "13:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "10:00 → 13:00"
    And no time is marked on "2026-06-21"
    When I press the time "11:00" of "2026-06-20"
    Then no time is marked on "2026-06-20"

  Scenario: Each end of a time range moves by quarters
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "12:00" of "2026-06-20"
    And I move the time "12:00" of "2026-06-20" 2 quarters later
    And I move the time "10:00" of "2026-06-20" 1 quarter later
    Then the times marked on "2026-06-20" are "10:15 → 12:30"
    When I move the time "12:30" of "2026-06-20" 2 quarters earlier
    Then the time "12:00" of "2026-06-20" cannot be moved earlier

  Scenario: A drag from an end of a time range moves that end, and from between them does nothing
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "13:00" of "2026-06-20"
    And I move the time "13:00" of "2026-06-20" 1 quarter later
    And I drag from the time "13:15" to the time "15:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "10:00 → 15:15"
    When I drag from the time "12:00" to the time "16:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "10:00 → 15:15"
    # Past its other end the range turns around, each end with its minutes.
    When I drag from the time "15:15" to the time "9:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "9:15 → 10:00"
    # An end left on the other: a time of its own.
    When I drag from the time "9:15" to the time "10:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "10:00"

  Scenario: A time range takes in the times on its way and stops at another range
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "12:00" of "2026-06-20"
    And I drag from the time "14:00" to the time "15:00" of "2026-06-20"
    And I drag from the time "10:00" to the time "17:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "10:00 → 13:00, 14:00 → 15:00"

  Scenario: A drag held at the end of the list goes on to the last hour of the day
    Given the screen measures 1280 by 800
    And I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "15:00" of "2026-06-20" down to the end of its list, until "23:00" shows
    Then the times marked on "2026-06-20" are "15:00 → 23:00"

  Scenario: A time is saved with its "+" and waits under its column, its hours free again
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "13:00" of "2026-06-20"
    And I move the time "13:00" of "2026-06-20" 1 quarter later
    And I save the time "10:00 → 13:15" of "2026-06-20" with its "+"
    Then no time is marked on "2026-06-20"
    And the saved times of "2026-06-20" are "10:00 → 13:15"
    And "2026-06-21" has no saved times
    When I press the time "11:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "11:00"
    And the saved times of "2026-06-20" are "10:00 → 13:15"

  Scenario: The "+" of a time just marked waits for the mouse to come back, and a press on its place does nothing
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    Then no "+" is shown on the times
    When I press the place of the "+" of the time "18:00" of "2026-06-20"
    Then the times marked on "2026-06-20" are "18:00"
    And "2026-06-20" has no saved times

  Scenario: Saved times are kept by when they start, then by when they end, and one like another only once
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I save the time "18:00" of "2026-06-20" with its "+"
    And I drag from the time "10:00" to the time "12:00" of "2026-06-20"
    And I save the time "10:00 → 12:00" of "2026-06-20" with its "+"
    And I press the time "10:00" of "2026-06-20"
    And I save the time "10:00" of "2026-06-20" with its "+"
    Then the saved times of "2026-06-20" are "10:00, 10:00 → 12:00, 18:00"
    When I press the time "18:00" of "2026-06-20"
    And I save the time "18:00" of "2026-06-20" with its "+"
    Then the saved times of "2026-06-20" are "10:00, 10:00 → 12:00, 18:00"
    And no time is marked on "2026-06-20"

  Scenario: A saved time is seen on its hours from its pill and deleted with its "−"
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "12:00" of "2026-06-20"
    And I save the time "10:00 → 12:00" of "2026-06-20" with its "+"
    And I move the mouse over the saved time "10:00 → 12:00" of "2026-06-20"
    Then the saved time "10:00 → 12:00" is outlined on the hours of "2026-06-20"
    When I delete the saved time "10:00 → 12:00" of "2026-06-20"
    Then "2026-06-20" has no saved times
    And no time is marked on "2026-06-20"

  Scenario: A saved time is edited from its pill by quarters, and Escape undoes the edit
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I drag from the time "10:00" to the time "12:00" of "2026-06-20"
    And I save the time "10:00 → 12:00" of "2026-06-20" with its "+"
    And I press the saved time "10:00 → 12:00" of "2026-06-20"
    Then the saved time "10:00 → 12:00" of "2026-06-20" is being edited
    And no saved time of "2026-06-20" has a "−"
    When I move the edited time of "2026-06-20" 2 quarters later at "12:00"
    And I move the edited time of "2026-06-20" 1 quarter later at "10:00"
    Then the saved times of "2026-06-20" are "10:15 → 12:30"
    When I press the saved time "10:15 → 12:30" of "2026-06-20"
    Then no saved time of "2026-06-20" is being edited
    And the saved times of "2026-06-20" are "10:15 → 12:30"
    When I press the saved time "10:15 → 12:30" of "2026-06-20"
    And I move the edited time of "2026-06-20" 1 quarter later at "12:30"
    And I press the key "Escape"
    Then no saved time of "2026-06-20" is being edited
    And the saved times of "2026-06-20" are "10:15 → 12:30"

  Scenario: A saved time edited into one like another joins it when the edit ends, and the press that ends it still marks
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I save the time "18:00" of "2026-06-20" with its "+"
    And I press the time "18:00" of "2026-06-20"
    And I move the time "18:00" of "2026-06-20" 1 quarter later
    And I save the time "18:15" of "2026-06-20" with its "+"
    Then the saved times of "2026-06-20" are "18:00, 18:15"
    When I press the saved time "18:15" of "2026-06-20"
    And I move the edited time of "2026-06-20" 1 quarter earlier at "18:00"
    Then the saved times of "2026-06-20" are "18:00, 18:00"
    When I press the time "9:00" of "2026-06-20"
    Then the saved times of "2026-06-20" are "18:00"
    And the times marked on "2026-06-20" are "9:00"

  Scenario: From five saved times, four are in sight between their own "︿" and "﹀"
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I save each hour from 9 to 12 of "2026-06-20"
    Then the saved times of "2026-06-20" are "9:00, 10:00, 11:00, 12:00"
    And the saved times of "2026-06-20" have no "︿" nor "﹀"
    When I save each hour from 13 to 13 of "2026-06-20"
    Then the saved times of "2026-06-20" in sight are "10:00, 11:00, 12:00, 13:00"
    When I press the "︿" of the saved times of "2026-06-20"
    Then the saved times of "2026-06-20" in sight are "9:00, 10:00, 11:00, 12:00"

  Scenario: A time is saved, edited and deleted with the keyboard
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I reach the times with the Tab key
    And I press the key "Enter"
    And I press the key "Tab"
    Then the focus is on the "+" of the time "9:00" of "2026-06-20"
    When I press the key "Enter"
    Then the saved times of "2026-06-20" are "9:00"
    And the focus is on the time "9:00" of "2026-06-20"
    When I press the key "Tab"
    Then the focus is on the saved time "9:00" of "2026-06-20"
    When I press the key "Enter"
    And I press the key "ArrowRight" 2 times
    Then the saved times of "2026-06-20" are "9:30"
    When I press the key "Enter"
    And I press the key "Tab"
    And I press the key "Enter"
    Then "2026-06-20" has no saved times

  @touch
  Scenario: With a finger, a time is saved with the "+" button, edited from its pill and deleted with its "−"
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    Then no "+" is shown on the times
    When I press the button "Guardar una hora" of the times step
    And I save the time "18:00" of "2026-06-20" with its "+"
    Then no time is marked on "2026-06-20"
    And the saved times of "2026-06-20" are "18:00"
    And no "+" is shown on the times
    And no saved time of "2026-06-20" has a "−"
    When I press the saved time "18:00" of "2026-06-20"
    And I move the edited time of "2026-06-20" 1 quarter later at "18:00"
    Then the saved times of "2026-06-20" are "18:15"
    When I delete the saved time "18:15" of "2026-06-20" with the "−" on its pill
    Then "2026-06-20" has no saved times

  Scenario: The trash of a column clears its marked and its saved times, and only those
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    Then "2026-06-20" has no trash
    When I drag from the time "10:00" to the time "12:00" of "2026-06-20"
    And I save the time "10:00 → 12:00" of "2026-06-20" with its "+"
    Then "2026-06-20" has a trash
    When I press the time "18:00" of "2026-06-20"
    And I press the time "9:00" of "2026-06-21"
    And I press the trash of "2026-06-20"
    And I answer the trash of "2026-06-20" "Sí"
    Then no time is marked on "2026-06-20"
    And "2026-06-20" has no saved times
    And "2026-06-20" has no trash
    And the times marked on "2026-06-21" are "9:00"
    And "2026-06-21" has a trash

  Scenario Outline: The trash of a column asks before it clears, <with>
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I press the trash of "2026-06-20"
    Then the trash of "2026-06-20" asks "¿Borrar?" in its place
    When I answer the trash of "2026-06-20" "No"
    Then "2026-06-20" has a trash
    And the times marked on "2026-06-20" are "18:00"
    When I press the trash of "2026-06-20"
    And I answer the trash of "2026-06-20" "Sí"
    Then no time is marked on "2026-06-20"
    And "2026-06-20" has no trash

    Examples:
      | with         |
      | with a mouse |

    @touch
    Examples:
      | with          |
      | with a finger |

  Scenario: Without "Horario", "Siguiente" goes on past the times
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I press "Siguiente" on the dates step
    Then I am on the last step
    And there are no columns of times

  Scenario: Without a date of its own, "Siguiente" goes on past the times
    Given I am on the dates step of the creation wizard
    When I press the day "2026-06-20"
    And I turn the "Horario" switch on
    And I press the day "2026-06-20"
    And I drag from the day "2026-06-22" to the day "2026-06-26"
    And I press "Siguiente" on the dates step
    Then I am on the last step
    And there are no columns of times

  Scenario: The times and the dates are kept while visiting the dates step
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I press the time "9:00" of "2026-06-21"
    And I go back to the dates step
    And I press the day "2026-06-21"
    And I press the day "2026-06-21"
    And I go on to the times step
    Then the times marked on "2026-06-20" are "18:00"
    And no time is marked on "2026-06-21"

  Scenario: Turning "Horario" off forgets the times marked
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I press the time "18:00" of "2026-06-20"
    And I go back to the dates step
    And I turn the "Horario" switch off
    Then the "Horario" switch is off
    When I turn the "Horario" switch on
    And I go on to the times step
    Then no time is marked on "2026-06-20"

  # The largest page the wizard draws, 49 columns of hours, read whole by the accessibility
  # check after every press: three times the time of the others.
  @slow
  Scenario: The times count as options, on the dates step too, and the 61st is not marked
    Given I am on the dates step of the creation wizard
    When I mark the 49 days from "2026-06-15"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the time "9:00" of "2026-06-15"
    Then no options counter is shown
    When I press the time "10:00" of "2026-06-15"
    Then the options counter reads "50 de 60 opciones"
    When I press each hour from 11 to 20 of "2026-06-15"
    Then the options counter reads "60 de 60 opciones"
    When I press the time "21:00" of "2026-06-15"
    Then the times marked on "2026-06-15" are "9:00, 10:00, 11:00, 12:00, 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00, 20:00"
    And the options counter reads "60 de 60 opciones"
    When I press the time "20:00" of "2026-06-15"
    Then the options counter reads "59 de 60 opciones"
    When I go back to the dates step
    Then the options counter reads "59 de 60 opciones"

  Scenario: The step's arrows move the columns one at a time, four on screen
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 6 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
    And the place among the columns reads "1 / 3"
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
      | 2026-06-24 |
    And the place among the columns reads "2 / 3"
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-22 |
      | 2026-06-23 |
      | 2026-06-24 |
      | 2026-06-25 |
    And the place among the columns reads "3 / 3"
    When I press the step's arrow "Día anterior"
    Then the place among the columns reads "2 / 3"
    When I press the step's arrow "Día siguiente"
    And I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary
    And there are no columns of times

  Scenario: A held arrow goes on moving the columns and stops at the last, without leaving the step
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 7 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I hold the step's arrow "Día siguiente" down
    Then the place among the columns reads "4 / 4"
    When I let the arrow go half a second later
    Then I am on step 3
    And the columns of times on screen are:
      | column     |
      | 2026-06-23 |
      | 2026-06-24 |
      | 2026-06-25 |
      | 2026-06-26 |
    When I press the step's arrow "Siguiente"
    Then I am on step 3, on its summary

  Scenario: A column that leaves the screen comes back as it was left
    Given the screen measures 1280 by 800
    And I am on the dates step of the creation wizard
    When I mark the 5 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I press the "﹀" of the column of "2026-06-20" 5 times in a row
    Then the column of "2026-06-20" shows the 9 hours from "14:00"
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
      | 2026-06-24 |
    When I press the step's arrow "Día anterior"
    Then the column of "2026-06-20" shows the 9 hours from "14:00"

  Scenario: The times are marked and moved with the keyboard alone
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I reach the times with the Tab key
    Then the focus is on the time "9:00" of "2026-06-20"
    When I press the key "ArrowDown" 2 times
    And I press the key "Enter" 1 time
    Then the times marked on "2026-06-20" are "11:00"
    When I press the key "ArrowRight" 2 times
    And I press the key "ArrowLeft" 1 time
    Then the times marked on "2026-06-20" are "11:15"
    And the focus is on the time "11:15" of "2026-06-20"
    When I press the key "Tab" 1 time
    Then the focus is on the "+" of the time "11:15" of "2026-06-20"
    When I press the key "Tab" 1 time
    Then the focus is on the trash of "2026-06-20"
    When I press the key "Tab" 1 time
    Then the focus is on the time "9:00" of "2026-06-21"
    When I press the key "Space" 1 time
    Then the times marked on "2026-06-21" are "9:00"

  Scenario: A time range is made with the keyboard alone
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I reach the times with the Tab key
    And I press the key "Shift+Enter" 1 time
    Then a tip over the time "9:00" of "2026-06-20" reads "Elige la última hora del rango."
    And screen readers hear in the column of "2026-06-20": "Elige la última hora del rango."
    When I press the key "ArrowDown" 2 times
    Then no tip is shown over the times
    When I press the key "Enter" 1 time
    Then the times marked on "2026-06-20" are "9:00 → 11:00"
    And the focus is on the time "11:00" of "2026-06-20"
    And screen readers hear nothing in the column of "2026-06-20"
    When I press the key "ArrowRight" 2 times
    Then the times marked on "2026-06-20" are "9:00 → 11:30"
    When I press the key "ArrowUp" 1 time
    And I press the key "Enter" 1 time
    Then no time is marked on "2026-06-20"

  Scenario: Escape lets go of the hour held with the keyboard
    Given I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I reach the times with the Tab key
    And I press the key "Shift+Enter" 1 time
    And I press the key "ArrowDown" 2 times
    And I press the key "Escape" 1 time
    Then no time is marked on "2026-06-20"
    And I am on step 3
    When I press the key "Enter" 1 time
    Then the times marked on "2026-06-20" are "11:00"

  @touch
  Scenario: With a finger, a time range begins by resting on an hour and sliding
    Given the screen measures 375 by 667
    And I am on the times step with the dates "2026-06-20" and "2026-06-21"
    When I rest a finger on the time "9:00" of "2026-06-20" and slide it to the time "11:00"
    Then the times marked on "2026-06-20" are "9:00 → 11:00"
    When I press the time "10:00" of "2026-06-20"
    Then no time is marked on "2026-06-20"
    # A finger that slides without resting moves the list, as anywhere.
    When I slide a finger from the time "11:00" of "2026-06-20" to the time "9:00" without resting
    Then no time is marked on "2026-06-20"
    And the time "9:00" of "2026-06-20" is out of sight

  @touch
  Scenario: With a finger, a ring closes on an hour from outside the finger until the hour is held
    Given the screen measures 375 by 480
    And I am on the times step with the dates "2026-06-20" and "2026-06-21"
    Then a finger that rests on the time "9:00" of "2026-06-20" sees a ring close on it until the hour is held
    And the times marked on "2026-06-20" are "9:00"
    # The ring is where its hour is on screen, also once the page has moved under it.
    When I scroll the page down by 80 px
    Then a finger that rests on the time "11:00" of "2026-06-20" sees a ring close on it until the hour is held
    And the times marked on "2026-06-20" are "9:00, 11:00"

  @touch
  Scenario: With a finger, a slide sideways moves the columns, as many as it passes
    Given the screen measures 375 by 667
    And I am on the dates step of the creation wizard
    When I mark the 5 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I slide a finger from the time "9:00" of "2026-06-21" to the time "9:00" of "2026-06-20"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
    And the place among the columns reads "2 / 3"
    And no time is marked on "2026-06-21"
    When I press the step's arrow "Día siguiente"
    Then the place among the columns reads "3 / 3"
    # The columns follow the finger: the way of two columns moves two.
    When I slide a finger from the time "9:00" of "2026-06-22" to the time "9:00" of "2026-06-24"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
    And the place among the columns reads "1 / 3"
    # Before the first column there is none to bring.
    When I slide a finger from the time "9:00" of "2026-06-20" to the time "9:00" of "2026-06-21"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
    And no time is marked on "2026-06-20"

  @touch
  Scenario: With a finger, a slide after resting on an hour draws its time range and the columns stay
    Given the screen measures 375 by 667
    And I am on the dates step of the creation wizard
    When I mark the 5 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    And I rest a finger on the time "9:00" of "2026-06-20" and slide it to the time "11:00" of "2026-06-21"
    Then the times marked on "2026-06-20" are "9:00 → 11:00"
    And the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |

  @touch
  Scenario: With a finger, three columns on screen and the whole step on a short screen
    Given the screen measures 375 by 667
    And I am on the dates step of the creation wizard
    When I mark the 4 days from "2026-06-20"
    And I turn the "Horario" switch on
    And I go on to the times step
    Then the columns of times on screen are:
      | column     |
      | 2026-06-20 |
      | 2026-06-21 |
      | 2026-06-22 |
    And the place among the columns reads "1 / 2"
    And the step ends above the bottom of the screen
    When I press the time "9:00" of "2026-06-20"
    And I move the time "9:00" of "2026-06-20" 1 quarter later
    Then the times marked on "2026-06-20" are "9:15"
    And the arrows of the time "9:15" of "2026-06-20" are the two ends of its band
    When I press the step's arrow "Día siguiente"
    Then the columns of times on screen are:
      | column     |
      | 2026-06-21 |
      | 2026-06-22 |
      | 2026-06-23 |
    When I press the step's arrow "Día anterior"
    Then the times marked on "2026-06-20" are "9:15"

  Scenario: A deadline after the first date warns but does not block
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    When I set the deadline to "2026-07-08"
    Then I see a warning that the deadline is after the first date
    And I can still create the event

  Scenario: The API enforces the option limits
    Given I am signed in as "ana@example.com" with the name "Ana"
    When the API is asked to create an event with 61 options
    Then it answers 400 and no event is created
    When the API is asked to create an event with a date on "2027-07-01"
    Then it answers 400 and no event is created
    When the API is asked to create an event with a date on "2026-06-14"
    Then it answers 400 and no event is created
    When the API is asked to create an event with the time "18:10"
    Then it answers 400 and no event is created
    When the API is asked to create an event with two equal options
    Then it answers 400 and no event is created
    When the API is asked to create an event with the time range "20:00-19:00"
    Then it answers 400 and no event is created

  Scenario: A server error keeps the wizard
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    And the API will fail the next request
    When I press "Crear"
    Then I see an error with "Reintentar"
    And the wizard still holds everything I entered

  Scenario: An event whose answer was lost is created once with "Reintentar"
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    And the answer to the next "Crear" will be lost once the event is stored
    When I press "Crear"
    Then I see an error with "Reintentar"
    When I press "Reintentar"
    Then I see the "¡Hecho!" step with the participation link
    And I own exactly one event

  Scenario: A reload brings the wizard back on the step it was left, with everything entered
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    And I have written the note "Cenamos en casa de Marta."
    When I reload the page
    Then the wizard still holds everything I entered

  Scenario: A reload on the summary comes back to it
    Given I have chosen the date "2026-07-10" and the date "2026-07-06" with the times "20:00-22:00" and "18:15"
    When I reach the summary step
    And I reload the page
    Then I am on step 3, on its summary
    And the summary on screen is:
      | column     | options            |
      | 2026-07-06 | 18:15, 20:00–22:00 |
      | 2026-07-10 | Sin horario        |

  Scenario: An event whose answer was lost is created once after a reload
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    And the answer to the next "Crear" will be lost once the event is stored
    When I press "Crear"
    Then I see an error with "Reintentar"
    When I reload the page
    And I press "Crear"
    Then I see the "¡Hecho!" step with the participation link
    And I own exactly one event

  Scenario: Once the event is created, a reload opens a new wizard, which proposes the name of that event
    Given I am signed in as "ana@example.com" with the name "Ana"
    And I have chosen the date "2026-07-06"
    When I press "Crear"
    Then I see the "¡Hecho!" step with the participation link
    When I reload the page
    Then I am on step 1
    And the title field holds ""
    When I go on to the last step with the title "Paseo" and the date "2026-07-06"
    Then the name field holds "Ana"
